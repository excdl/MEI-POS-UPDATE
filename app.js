const API_URL = "https://script.google.com/macros/s/AKfycbxIONfqq50nNi5V0XKYaWN1k4-1pBhUChyOLsFOkCYGUr55y6FfG_Vb5f3Jrl7l9xk0Kg/exec";

function formatNumber(num) { 
    if (num === null || num === undefined || num === "") return "0"; 
    let n = Number(num); 
    if (isNaN(n)) return "0"; 
    return n.toLocaleString('zh-TW'); 
}

let POS_STORE = "";
let posCart = [], currentTax = "應稅";
let editIndex = null;       // 正在編輯的商品索引
let editingField = null;    // 正在編輯的欄位
let modalType = null;
let kpTarget = null;

// ⭐ 新增：桌號暫存與加點機制變數
let openTabs = {};          // 儲存各桌未結帳暫存資料 { "A01": { cart: [...], peopleCount, minConsume, salesName } }
let currentTableNo = "";    // 目前操作中的桌號

// ====== 更快的 IP 取得（含 sessionStorage 快取）======
async function getIP() {
    const cache = sessionStorage.getItem("myIP");
    if (cache) return cache;

    try {
        const res = await fetch("https://api.ipify.org?format=json");
        const data = await res.json();
        sessionStorage.setItem("myIP", data.ip);
        return data.ip;
    } catch {
        return "";
    }
}

function updateLoginTime() {
  const now = new Date();
  const timeStr = now.toLocaleString("zh-TW",{hour12:false});
  const loginTimeEl = document.getElementById("loginTime");
  if(loginTimeEl) loginTimeEl.innerText = `登入時間：${timeStr}`;
}

async function login() {
  const loginBtn = document.getElementById("loginBtn");
  loginBtn.innerText = "登入中...";
  loginBtn.disabled = true;

  const store = document.getElementById("storeInput").value;
  const pwd = document.getElementById("passwordInput").value;
  const userIP = await getIP();

  try {
    const res = await fetch(`${API_URL}?action=login&store=${store}&pwd=${pwd}&ip=${userIP}`);
    const data = await res.json();

    if (data.status === "success") {
      POS_STORE = data.storeCode;

      // 隱藏登入頁，顯示 POS
      document.getElementById("loginPage").style.display = "none";
      document.getElementById("posApp").style.display = "flex";

      // 顯示門市資訊
      document.getElementById("storeInfo").innerText = `${data.storeName}（${data.storeCode}）`;

      // 更新並每秒刷新登入時間
      updateLoginTime();
      setInterval(updateLoginTime, 1000);
      
      // 取得商品資料
      fetchProducts();
      fetchSalesList();
      setTimeout(() => {
        const cashBtn = document.querySelector('#paymentButtons .payBtn[data-pay="現金"]');
        if (cashBtn) cashBtn.click();
      }, 0);

      // ⭐ 初始化桌號列渲染
      renderActiveTablesBar();

    } else {
      document.getElementById("loginMsg").innerText = data.message;
      loginBtn.innerText = "登入";
      loginBtn.disabled = false;
    }
  } catch (err) {
    console.error(err);
    document.getElementById("loginMsg").innerText = "登入失敗，請稍後再試";
    loginBtn.innerText = "登入";
    loginBtn.disabled = false;
  }
}

document.getElementById("logoutBtn").onclick = logout;

async function logout() {
    const logoutBtn = document.getElementById("logoutBtn");

    logoutBtn.disabled = true;
    logoutBtn.innerText = "登出中...";
    logoutBtn.classList.add("active");

    const now = new Date();
    const logoutTime = now.toLocaleString("zh-TW", { hour12: false });

    try {
        await fetch(`${API_URL}?action=logout&store=${POS_STORE}&time=${encodeURIComponent(logoutTime)}`);
    } catch (err) {
        console.error(err);
    } finally {
        document.getElementById("posApp").style.display = "none";
        document.getElementById("loginPage").style.display = "flex";

        document.getElementById("storeInput").value = "";
        document.getElementById("passwordInput").value = "";
        document.getElementById("loginMsg").innerText = "";

        const loginBtn = document.getElementById("loginBtn");
        loginBtn.innerText = "登入";
        loginBtn.disabled = false;

        POS_STORE = "";
        openTabs = {}; // 登出清空暫存桌
        currentTableNo = "";

        logoutBtn.disabled = false;
        logoutBtn.innerText = "登出";
        logoutBtn.classList.remove("active");
    }
}

// 綁定按鈕事件
document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("logoutBtn").addEventListener("click", logout);

// ===== 取得商品 =====
async function fetchProducts() {
    const res = await fetch(API_URL + "?action=products");
    products = await res.json();
    categories = [...new Set(products.map(x => x["類別"]))];
    renderCategories();
    if (categories.length > 0) renderProducts(categories[0]);
}

async function fetchSalesList() {
  try {
    const res = await fetch(`${API_URL}?action=salesList&storeCode=${POS_STORE}`);
    const data = await res.json();

    if (data.status !== "success") return;

    const listEl = document.getElementById("salesList");
    if (!listEl) return;
    listEl.innerHTML = "";

    data.list.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      listEl.appendChild(opt);
    });
  } catch (err) {
    console.error("載入業代失敗", err);
  }
}

// ===== 渲染分類 =====
function renderCategories() {
    const box = document.getElementById("posCategories");
    if (!box) return;
    box.querySelectorAll("button.cat-btn").forEach(b => b.remove());

    categories.forEach(cat => {
        const btn = document.createElement("button");
        btn.classList.add("cat-btn");
        btn.textContent = cat;
        btn.onclick = () => {
            document.querySelectorAll("#posCategories button.cat-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderProducts(cat);
        };
        box.appendChild(btn);
    });

    const firstBtn = box.querySelector("button.cat-btn");
    if (firstBtn) firstBtn.classList.add("active");
}

// ===== 搜尋商品 =====
const searchBox = document.getElementById("searchBox");
if (searchBox) {
    searchBox.oninput = function () {
        renderProducts(null, this.value.trim().toLowerCase());
    };
}

function parseNumber(str) {
    if (!str) return 0;
    return Number(str.toString().replace(/,/g, ""));
}

/*********************************
 * 存酒 Modal 控制用
 *********************************/
let pendingStoreProduct = null;

/*********************************
 * ===== 渲染商品 =====
 *********************************/
function renderProducts(category = null, search = "") {
    const box = document.getElementById("posProducts");
    if (!box) return;
    box.innerHTML = "";

    products
        .filter(p => {
            if (category && p["類別"] !== category) return false;
            if (search && !p["商品名稱"].toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        })
        .forEach(p => {
            const card = document.createElement("div");
            card.className = "product-card";
            card.innerHTML = `
                <h4>${p["商品名稱"]}</h4>
                <p>${p["售價"]} 元 / ${p["單位"]}</p>
            `;

            card.onclick = () => {
                if (p["是否存酒"] === "Y") {
                    openStoreWineModal(p);
                } else {
                    addPOSItem(p, false);
                }
            };

            box.appendChild(card);
        });
}

/*********************************
 * ===== 存酒 Modal =====
 *********************************/
function openStoreWineModal(product) {
    pendingStoreProduct = product;
    document.getElementById("storeWineTitle").innerText = `【${product["商品名稱"]}】`;
    document.getElementById("storeWineModal").style.display = "flex";
}

function confirmStoreWine(isStore) {
    if (!pendingStoreProduct) return;
    addPOSItem(pendingStoreProduct, isStore);
    pendingStoreProduct = null;
    document.getElementById("storeWineModal").style.display = "none";
}

/*********************************
 * ===== 加入購物車 =====
 *********************************/
function addPOSItem(p, forceStore = false) { 
    let qtyAdd = 1;
    let pricePerUnit = Number(p["售價"]);
    let unit = p["單位"];
    if (unit === "半斤") { 
        qtyAdd = 0.5; 
        pricePerUnit *= 2; 
        unit = "斤"; 
    }

    const now = new Date();
    let expireDate = null;
    if (forceStore) {
        const months = p["存酒期限(月)"] ? Number(p["存酒期限(月)"]) : 2;
        const d = new Date(now);
        d.setMonth(d.getMonth() + months);
        expireDate = d.toLocaleDateString("zh-TW");
    }

    let exist = posCart.find(x => x.name === p["商品名稱"] && x.isStored === forceStore);

    if (exist) {
        exist.quantity += qtyAdd;
    } else {
        posCart.push({
            name: p["商品名稱"],
            quantity: qtyAdd,
            price: pricePerUnit,
            unit: unit,
            discount: null,
            isCorkage: p["商品名稱"] === "開瓶費",
            isStored: forceStore,
            storeMonths: Number(p["存酒期限(月)"]) || 0,
            storeDate: forceStore ? now.toLocaleDateString("zh-TW") : null,
            expireDate: forceStore ? expireDate : null
        });
    }

    renderCart();
}

/*********************************
 * ===== 初始化付款方式 =====
 *********************************/
function initPOSButtons() {
    const buttons = document.querySelectorAll("#paymentButtons .payBtn");
    buttons.forEach(btn => {
        btn.addEventListener("click", function () {
            buttons.forEach(b => b.classList.remove("active"));
            this.classList.add("active");

            const pay = this.getAttribute("data-pay");
            document.getElementById("posPayment").value = pay;

            const cashPanel = document.getElementById("cashPanel");
            const cashInput = document.getElementById("cashInput");
            const changeOut = document.getElementById("changeOut");

            if (pay === "現金") {
                cashPanel.style.display = "block";
            } else {
                cashPanel.style.display = "none";
                cashInput.value = "";
                changeOut.innerText = "0";
            }

            renderCart();
        });
    });
}

document.addEventListener("DOMContentLoaded", initPOSButtons);

/*********************************
 * ===== 渲染購物車 =====
 *********************************/
function renderCart() {
    const box = document.getElementById("posCart");
    if (!box) return;
    box.innerHTML = "";
    let totalBeforeTax = 0;
    let totalForMinConsume = 0; 
    
    posCart.forEach((item, i) => {
        let sub = item.quantity * item.price;

        if (item.discount) {
            switch (item.discount.type) {
                case "第二件減10":
                    sub -= Math.floor(item.quantity / 2) * 10;
                    break;
                case "買二送一":
                    sub -= Math.floor(item.quantity / 3) * item.price;
                    break;
                case "買一送一":
                    sub -= Math.floor(item.quantity / 2) * item.price;
                    break;
                case "第二件6折":
                    sub -= Math.floor(item.quantity / 2) * item.price * 0.4;
                    break;
                default:
                    sub *= item.discount.rate || 1;
                    break;
            }
        }

        totalBeforeTax += sub;
        if (!item.isCorkage) {
            totalForMinConsume += sub;
        }

        const row = document.createElement("div");
        row.className = "cartRow";
        row.innerHTML = `
            <span class="name" onclick="openPromoModal(posCart[${i}])">
              ${item.name}
              ${item.isStored ? "<b style='color:#27ae60;'>🧊存酒</b>" : ""}
            </span>
            <span class="qty" onclick="openEditModal(${i},'quantity')">
              ${item.quantity.toFixed(0)} ${item.unit}
            </span>
            <span class="price" onclick="openEditModal(${i},'price')">${item.price}</span>
            <span class="subtotal">${formatNumber(Math.round(sub))}</span>
            <span class="remove">
              <button onclick="removeItem(${i})">刪</button>
            </span>
        `;
        box.appendChild(row);
    });

    let beforeTax = Math.round(totalBeforeTax);
    let tax = currentTax === "應稅" ? Math.round(beforeTax * 0.05) : 0;
    let afterTax = beforeTax + tax;

    let discountValue = Number(document.getElementById("discount").value) || 0;
    let actualAmount = afterTax - discountValue;

    let minConsume = getMinConsumeTotal();
    let baseAmount = Math.max(totalForMinConsume, minConsume);
    let corkageAmount = totalBeforeTax - totalForMinConsume;
    let receivable = baseAmount + corkageAmount;

    document.getElementById("beforeTax").innerText = formatNumber(beforeTax);
    document.getElementById("taxAmount").innerText = formatNumber(tax);
    document.getElementById("afterTax").innerText = formatNumber(afterTax);

    const posTotalEl = document.getElementById("posTotal");
    posTotalEl.dataset.value = receivable;
    posTotalEl.innerText = formatNumber(receivable);

    updateChange();

    const alertEl = document.getElementById("minConsumeAlert");
    const checkoutBtn = document.getElementById("posCheckout");
    if (actualAmount < minConsume && minConsume > 0) {
        if (alertEl) alertEl.style.display = "block";
        posTotalEl.style.color = "#c0392b";
        checkoutBtn.classList.add("minAlert");
    } else {
        if (alertEl) alertEl.style.display = "none";
        posTotalEl.style.color = "#2c3e50";
        checkoutBtn.classList.remove("minAlert");
    }
}

function updateChange() {
    const paymentMethod = document.getElementById("posPayment").value;
    const cash = Number(document.getElementById("cashInput").value) || 0;

    const totalEl = document.getElementById("posTotal");
    const receivable = Number(totalEl.dataset.value || totalEl.innerText.replace(/,/g, "")) || 0;

    const change = paymentMethod === "現金" ? Math.max(cash - receivable, 0) : 0;
    document.getElementById("changeOut").innerText = formatNumber(change);
}

const checkWineBtn = document.getElementById('checkWineBtn');
if (checkWineBtn) {
    checkWineBtn.addEventListener('click', () => {
        window.open('https://excdl.github.io/wine/', '_blank');
    });
}

document.getElementById("discount").addEventListener("input", renderCart);
document.getElementById("cashInput").addEventListener("input", updateChange);

async function updateTodaySales() {
  const now = new Date();
  const formatDate = now.getFullYear() + "/" +
                     String(now.getMonth() + 1).padStart(2, "0") + "/" +
                     String(now.getDate()).padStart(2, "0");

  try {
    const res = await fetch(`${API_URL}?action=todaySales&storeCode=${POS_STORE}&date=${formatDate}`);
    const data = await res.json();

    if(data.status === "success") {
        const todaySalesDisplay = document.getElementById("todaySalesDisplay");
        if (todaySalesDisplay) {
            todaySalesDisplay.innerHTML =
            `<b>今日營業概況</b>
—————————————
總額：${data.total.toFixed(0)} 元
現金：${data.cash.toFixed(0)} 元
刷卡：${data.credit.toFixed(0)} 元
Line Pay：${data.linePay.toFixed(0)} 元`;
        }
    }
  } catch (err) {
    console.error("更新今日營業額時發生錯誤：", err);
  }
}

setInterval(updateTodaySales, 30000);

document.getElementById("shiftEndBtn").onclick = async function() {
  if (posCart.length > 0 && !confirm("購物車尚有未結帳商品，是否仍交班？")) return;

  const now = new Date();
  const formatDate = now.getFullYear() + "/" + String(now.getMonth() + 1).padStart(2, "0") + "/" + String(now.getDate()).padStart(2, "0");
  const formatTime = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0");

  const payload = {
    storeCode: POS_STORE,
    storeName: document.getElementById("storeInfo").innerText.split("（")[0],
    shiftDate: formatDate,
    shiftEndTime: formatTime
  };

  const res = await fetch(`${API_URL}?action=shiftEnd`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  alert(`交班成功！
本班總營業額：${data.total} 元
現金：${data.cash} 元
刷卡：${data.credit} 元
Line Pay：${data.linePay} 元`);

  posCart = [];
  renderCart();
  updateTodaySales();
};

document.getElementById("dailySalesBtn").onclick = updateTodaySales;

// ===== 刪除商品 =====
function removeItem(i) { 
    posCart.splice(i, 1); 
    renderCart(); 
}

document.getElementById("discount").onclick = () => {
  openPOSKeypad("discount", document.getElementById("discount").value);
};

document.getElementById("cashInput").onclick = () => {
  openPOSKeypad("cash", document.getElementById("cashInput").value);
};

function openEditModal(index, field) {
    editIndex = index;
    editingField = field;
    modalType = "edit";

    const modal = document.getElementById("editModal");
    const promoDiv = document.getElementById("promoButtons");
    const numpad = document.getElementById("numpad");
    const modalActions = document.querySelector("#editModal .modalActions");
    const modalInput = document.getElementById("modalInput");

    promoDiv.style.display = 'none';
    document.getElementById("editCloseBtn").style.display = 'none';

    if (field === 'discount' || field === 'cash') {
        kpTarget = field;
        document.getElementById("posKeypadTitle").innerText = field === "discount" ? "輸入折扣" : "收現金";
        document.getElementById("posKeypadInput").value = field === "discount" ? document.getElementById("discount").value : document.getElementById("cashInput").value || "";
        document.getElementById("posKeypadModal").style.display = "flex";
        return;
    }

    numpad.style.display = 'grid';
    modalInput.style.display = 'block';
    modalInput.readOnly = false;
    modalActions.style.display = 'flex';

    modalInput.value = posCart[index]?.[field] ?? "";
    document.getElementById("modalProductName").innerText = "輸入";
    document.getElementById("modalProductName").style.color = "#fff";
    modal.style.display = "flex";
}

function openPromoModal(item) {
    modalType = 'promo';
    editIndex = null;

    const modal = document.getElementById("editModal");
    const promoDiv = document.getElementById("promoButtons");

    document.getElementById("numpad").style.display = 'none';
    document.getElementById("modalInput").style.display = 'none';
    promoDiv.style.display = 'grid';
    promoDiv.innerHTML = '';
    document.querySelector("#editModal .modalActions").style.display = 'none';
    document.getElementById("editCloseBtn").style.display = 'block';

    const promoList = [
        { name: '95折', rate: 0.95 },
        { name: '9折', rate: 0.9 },
        { name: '85折', rate: 0.85 },
        { name: '8折', rate: 0.8 },
        { name: '7折', rate: 0.7 },
        { name: '6折', rate: 0.6 },
        { name: '買一送一', type: '買一送一' },
        { name: '買二送一', type: '買二送一' },
        { name: '第二件減10', type: '第二件減10' },
        { name: '第二件6折', type: '第二件6折' }
    ];

    promoList.forEach(p => {
        const btn = document.createElement("button");
        btn.innerText = p.name;
        btn.onclick = () => {
            let idx = posCart.findIndex(x => x.name === item.name);
            if (idx === -1) addPOSItem(item);

            idx = posCart.findIndex(x => x.name === item.name);
            if (idx !== -1) {
                posCart[idx].discount = p.type ? { type: p.type } : { rate: p.rate, type: "折扣" };
            }

            closeModal();
            renderCart();
        };
        promoDiv.appendChild(btn);
    });

    document.getElementById("modalProductName").innerText = item.name;
    modal.style.display = "flex";
}

function np(v) {
    const input = document.getElementById("modalInput");
    input.value += v;
}

function backspace() {
    const input = document.getElementById("modalInput");
    input.value = input.value.slice(0, -1);
}

function confirmEdit() {
    const val = document.getElementById("modalInput").value;

    if (editIndex !== null && editingField === 'quantity' && posCart[editIndex].unit === '斤') {
        const [j = 0, l = 0, q = 0] = val.split('.').map(Number);
        posCart[editIndex].quantity = j + l / 16 + q / 160;
    } else if (editIndex !== null) {
        posCart[editIndex][editingField] = Number(val);
    }

    closeModal();
    renderCart();
}

function closeModal() {
    document.getElementById("editModal").style.display = 'none';
    document.getElementById("posKeypadModal").style.display = 'none';

    document.querySelector("#editModal .modalActions").style.display = 'flex';
    document.getElementById("modalInput").style.display = 'block';
    document.getElementById("modalInput").readOnly = false;
    document.getElementById("numpad").style.display = 'grid';
    document.getElementById("promoButtons").style.display = 'none';
    document.getElementById("editCloseBtn").style.display = 'none';
}

function openPOSKeypad(type, value = "0") {
    kpTarget = type;
    document.getElementById("posKeypadTitle").innerText = type === "discount" ? "折扣金額" : "收現金";
    document.getElementById("posKeypadInput").value = value;
    document.getElementById("posKeypadModal").style.display = "flex";
}

function kpInput(v) {
    const input = document.getElementById("posKeypadInput");
    if (input.value === "0") input.value = "";
    input.value += v;
}

function kpBack() {
    const input = document.getElementById("posKeypadInput");
    input.value = input.value.slice(0, -1);
    if (!input.value) input.value = "0";
}

function kpConfirm() {
    const v = document.getElementById("posKeypadInput").value;

    if (kpTarget === "discount") {
        document.getElementById("discount").value = v;
        renderCart();
    }

    if (kpTarget === "cash") {
        document.getElementById("cashInput").value = v;
        updateChange();
    }

    document.getElementById("posKeypadModal").style.display = "none";
}

let allowMinConsumeCheckout = false;
function getMinConsumeTotal() {
  const people = Number(document.getElementById("peopleCount")?.value) || 0;
  const perMin = Number(document.getElementById("minConsumeInput")?.value) || 0;
  return people * perMin;
}

document.getElementById("minConsumeInput").addEventListener("input", () => {
  renderCart();
});

function setTax(t) {
    currentTax = t;
    document.getElementById("taxIncluded").classList.toggle('active', t === "應稅");
    document.getElementById("taxExempt").classList.toggle('active', t === "免稅");
    renderCart();
}

window.addEventListener("DOMContentLoaded", () => {
    setTax("免稅");
    document.getElementById("peopleCount")?.addEventListener("input", renderCart);
    document.getElementById("minConsumeInput")?.addEventListener("input", renderCart);
});

function formatDiscountRate(rate) {
    let d = rate * 100;
    let s = d.toString();
    if (d % 10 === 0) {
        s = (d / 10).toString();
    }
    return s + "折";
}

function calcDiscountedSubtotal(item) {
    let sub = item.quantity * item.price;
    if (item.discount) {
        switch (item.discount.type) {
            case "第二件減10":
                sub -= Math.floor(item.quantity / 2) * 10;
                break;
            case "買二送一":
                sub -= Math.floor(item.quantity / 3) * item.price;
                break;
            case "買一送一":
                sub -= Math.floor(item.quantity / 2) * item.price;
                break;
            case "第二件6折":
                sub -= Math.floor(item.quantity / 2) * item.price * 0.4;
                break;
            case "折扣":
                sub *= item.discount.rate;
                break;
        }
    }
    return Math.round(sub);
}

// ==========================================
// ⭐ 新增：桌號暫存 / 加點機制相關核心函式
// ==========================================

// 1. 暫存目前桌號與品項
function saveCurrentTableTab() {
    const tableInput = document.getElementById("tableNoInput");
    const tableNo = tableInput ? tableInput.value.trim() : "";

    if (!tableNo) {
        alert("請先輸入「桌號」再進行暫存！");
        tableInput?.focus();
        return;
    }

    if (posCart.length === 0) {
        alert("購物車是空的，無法暫存。");
        return;
    }

    openTabs[tableNo] = {
        cart: JSON.parse(JSON.stringify(posCart)),
        peopleCount: document.getElementById("peopleCount")?.value || 0,
        minConsume: document.getElementById("minConsumeInput")?.value || 400,
        salesName: document.getElementById("salesInput")?.value || ""
    };

    currentTableNo = tableNo;
    alert(`【桌號 ${tableNo}】點單已成功暫存！`);
    
    clearPOSScreenKeepTable();
    renderActiveTablesBar();
}

// 2. 載入某桌的暫存資料
function loadTableTab(tableNo) {
    if (posCart.length > 0 && currentTableNo !== tableNo) {
        if (!confirm(`當前畫面還有未暫存的品項，是否切換至【桌號 ${tableNo}】？`)) {
            return;
        }
    }

    const tabData = openTabs[tableNo];
    if (!tabData) return;

    currentTableNo = tableNo;
    document.getElementById("tableNoInput").value = tableNo;
    posCart = JSON.parse(JSON.stringify(tabData.cart));

    if (document.getElementById("peopleCount")) document.getElementById("peopleCount").value = tabData.peopleCount;
    if (document.getElementById("minConsumeInput")) document.getElementById("minConsumeInput").value = tabData.minConsume;
    if (document.getElementById("salesInput")) document.getElementById("salesInput").value = tabData.salesName;

    renderCart();
    renderActiveTablesBar();
}

// 3. 清空畫面但保留桌號狀態
function clearPOSScreenKeepTable() {
    posCart = [];
    currentTableNo = "";
    if (document.getElementById("tableNoInput")) document.getElementById("tableNoInput").value = "";
    renderCart();
}

// 4. 渲染上方暫存桌號快捷Bar
function renderActiveTablesBar() {
    let listEl = document.getElementById("tablesBarList");
    
    // 若 HTML 裡還沒有這個容器，自動在桌號輸入框旁邊建立一個
    if (!listEl) {
        const tableInput = document.getElementById("tableNoInput");
        if (tableInput && tableInput.parentNode) {
            const barContainer = document.createElement("div");
            barContainer.id = "tablesBarList";
            barContainer.style.cssText = "display:flex; gap:5px; margin-top:5px; flex-wrap:wrap;";
            tableInput.parentNode.appendChild(barContainer);
            listEl = barContainer;
        } else {
            return;
        }
    }

    const keys = Object.keys(openTabs);
    if (keys.length === 0) {
        listEl.innerHTML = `<span style="color:#888; font-size:12px;">(目前無暫存桌)</span>`;
        return;
    }

    listEl.innerHTML = "";
    keys.forEach(tNo => {
        const itemCount = openTabs[tNo].cart.reduce((sum, item) => sum + item.quantity, 0);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.style.cssText = "padding:3px 8px; border:1px solid #ccc; border-radius:4px; background:#f8f9fa; cursor:pointer; font-size:12px;";
        btn.innerHTML = `桌 ${tNo} <span style="background:#e74c3c; color:white; padding:1px 4px; border-radius:6px; font-size:10px;">${itemCount}品</span>`;
        
        if (currentTableNo === tNo) {
            btn.style.background = "#3498db";
            btn.style.color = "white";
        }

        btn.onclick = () => loadTableTab(tNo);
        listEl.appendChild(btn);
    });
}
// ==========================================

async function sendCheckoutToSheet() {
    const now = new Date();

    const payload = {
        orderDate: now.toLocaleDateString("zh-TW"),
        orderTime: now.toLocaleTimeString("zh-TW", { hour12: false }),
        checkoutDateTime: now.toLocaleString("zh-TW", { hour12: false }),

        storeName: document.getElementById("storeInfo").innerText.split("（")[0],
        storeCode: POS_STORE,

        salesName: document.getElementById("salesInput")?.value || "",
        peopleCount: Number(document.getElementById("peopleCount")?.value) || 0,
        tableNo: document.getElementById("tableNoInput")?.value || "", // ⭐ 順便帶入桌號至 Google Sheet

        taxStatus: currentTax,
        totalAmount: parseNumber(document.getElementById("posTotal").innerText),
        taxAmount: parseNumber(document.getElementById("taxAmount").innerText),
        paymentMethod: document.getElementById("posPayment").value,
        discount: Number(document.getElementById("discount").value) || 0,
        cashReceive: Number(document.getElementById("cashInput").value) || 0,
        change: Number(document.getElementById("changeOut").innerText) || 0,

        items: posCart.map(it => {
            const discountedSubtotal = calcDiscountedSubtotal(it);
            let promoText = "";
            if (it.discount) {
                promoText = it.discount.type === "折扣" ? formatDiscountRate(it.discount.rate) : it.discount.type;
            }

            return {
                category: products.find(p => p["商品名稱"] === it.name)?.["類別"] || "",
                name: it.name,
                quantity: it.quantity,
                price: it.price,
                subtotal: discountedSubtotal,
                promo: promoText
            };
        })
    };

    function addMonths(date, months) {
        const d = new Date(date);
        d.setMonth(d.getMonth() + months);
        return d.toLocaleDateString("zh-TW");
    }

    const storedItems = posCart
        .filter(it => it.isStored)
        .map(it => {
            const product = products.find(p => p["商品名稱"] === it.name);
            const nowDate = new Date();
            return {
                customerName: document.getElementById("customerName")?.value || "",
                customerPhone: document.getElementById("customerPhone")?.value || "",
                storeCode: payload.storeCode,
                storeName: payload.storeName,
                productName: it.name,
                totalQty: it.quantity,
                remainQty: it.quantity,
                unit: it.unit,
                storeDate: nowDate.toLocaleDateString("zh-TW"),
                expireDate: product && product["存酒期限(月)"] ? addMonths(nowDate, Number(product["存酒期限(月)"])) : addMonths(nowDate, 2)
            };
        });

    payload.storedItems = storedItems;

    await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

document.getElementById("posCheckout").onclick = async function () {
    const checkoutBtn = document.getElementById("posCheckout");
    if (checkoutBtn.disabled) return;

    const originalText = checkoutBtn.innerText;
    checkoutBtn.disabled = true;
    checkoutBtn.innerText = "結帳中...";

    const paymentMethod = document.getElementById("posPayment").value;
    if (!paymentMethod) {
        alert("請先選擇付款方式！");
        checkoutBtn.innerText = originalText;
        checkoutBtn.disabled = false;
        return;
    }

    let actual = parseNumber(document.getElementById("afterTax").innerText) - (Number(document.getElementById("discount").value) || 0);
    let min = getMinConsumeTotal();

    if (actual < min && !allowMinConsumeCheckout) {
        const message = `您的消費金額為 ${actual} 元，低於最低消費額 ${min} 元，是否確認結帳？`;
        if (confirm(message)) {
            allowMinConsumeCheckout = true;
            document.getElementById("afterTax").innerText = min;
            startCheckoutFlow(checkoutBtn, originalText);
        } else {
            checkoutBtn.innerText = originalText;
            checkoutBtn.disabled = false;
        }
        return;
    }

    allowMinConsumeCheckout = false;

    if (posCart.length === 0) {
        alert("購物車是空的。");
        checkoutBtn.innerText = originalText;
        checkoutBtn.disabled = false;
        return;
    }

    startCheckoutFlow(checkoutBtn, originalText);
};

async function startCheckoutFlow(checkoutBtn, originalText) {
    try {
        await sendCheckoutToSheet();
        setTimeout(updateTodaySales, 0);

        // ⭐ 結帳成功，自動清除該桌的暫存記錄
        const tableNo = document.getElementById("tableNoInput")?.value?.trim();
        if (tableNo && openTabs[tableNo]) {
            delete openTabs[tableNo];
        }
        if (currentTableNo && openTabs[currentTableNo]) {
            delete openTabs[currentTableNo];
        }

        alert("結帳完成！");

        posCart = [];
        currentTableNo = "";

        if (document.getElementById("discount")) document.getElementById("discount").value = "";
        if (document.getElementById("cashInput")) document.getElementById("cashInput").value = "";
        if (document.getElementById("changeOut")) document.getElementById("changeOut").innerText = "0";
        if (document.getElementById("tableNoInput")) document.getElementById("tableNoInput").value = "";
        if (document.getElementById("peopleCount")) document.getElementById("peopleCount").value = "0";
        if (document.getElementById("customerName")) document.getElementById("customerName").value = "";
        if (document.getElementById("customerPhone")) document.getElementById("customerPhone").value = "";

        fetchSalesList();
        renderCart();
        renderActiveTablesBar(); // 重新渲染桌號列

        document.querySelector('#paymentButtons .payBtn[data-pay="現金"]')?.click();

        checkoutBtn.innerText = originalText;
        checkoutBtn.disabled = false;

    } catch (error) {
        console.error("結帳過程中發生錯誤：", error);
        alert("結帳失敗，請重試。");
        checkoutBtn.innerText = originalText;
        checkoutBtn.disabled = false;
    }
}
