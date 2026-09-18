// ======================================================
// API
// ======================================================
const API_URL = "https://script.google.com/macros/s/AKfycby7o9yaep_tOpTddh6VYGj-TMbdPQfZHJDfctb0UHIKq-qMS3a6r8hdWvXYLX7lJA_5dQ/exec";

// ======================================================
// 基本工具
// ======================================================
function formatNumber(num) {
    if (num === null || num === undefined || num === "") {
        return "0";
    }
    let n = Number(num);
    if (isNaN(n)) {
        return "0";
    }
    return n.toLocaleString("zh-TW");
}

// ======================================================
// POS 全域變數
// ======================================================
let POS_STORE = "";
let posCart = [];
let currentTax = "免稅";
let editIndex = null;
let editingField = null;
let modalType = null;
let kpTarget = null;
let products = [];
let categories = [];

// ======================================================
// 桌號暫存系統
// ======================================================
let openTabs = {
    "外帶 / 一般": {
        cart: [],
        people: 1,
        minConsume: 400,
        sales: "",
        discount: ""
    }
};
let activeTabName = "外帶 / 一般";

// ======================================================
// 儲存目前桌號
// ======================================================
function saveCurrentTabState() {
    openTabs[activeTabName] = {
        cart: [...posCart],
        people: document.getElementById("peopleCount")?.value || 1,
        minConsume: document.getElementById("minConsumeInput")?.value || 400,
        sales: document.getElementById("salesInput")?.value || "",
        discount: document.getElementById("discount")?.value || ""
    };
    renderTabButtons();
}

// ======================================================
// 切換桌號
// ======================================================
function switchTab(tabName) {
    saveCurrentTabState();
    activeTabName = tabName;
    const tabData = openTabs[tabName] || {
        cart: [],
        people: 1,
        minConsume: 400,
        sales: "",
        discount: ""
    };
    posCart = [...tabData.cart];
    document.getElementById("peopleCount").value = tabData.people;
    document.getElementById("minConsumeInput").value = tabData.minConsume;
    document.getElementById("salesInput").value = tabData.sales;
    document.getElementById("discount").value = tabData.discount;
    renderCart();
    renderTabButtons();
}

// ======================================================
// 新增桌號
// ======================================================
function createNewTab() {
    const tabName = prompt("請輸入桌號或標籤名稱 (例如: A1桌, 包廂B):");
    if (!tabName) return;
    if (openTabs[tabName]) {
        alert("此桌號已存在！");
        switchTab(tabName);
        return;
    }
    openTabs[tabName] = {
        cart: [],
        people: 1,
        minConsume: 400,
        sales: "",
        discount: ""
    };
    switchTab(tabName);
}

// ======================================================
// 桌號按鈕
// ======================================================
function renderTabButtons() {
    const listEl = document.getElementById("tabList");
    if (!listEl) return;
    listEl.innerHTML = "";
    Object.keys(openTabs).forEach(name => {
        const wrapper = document.createElement("div");
        wrapper.className = `tab-wrapper ${name === activeTabName ? "active" : ""}`;
        const totalQty = openTabs[name].cart.reduce((sum, item) => sum + item.quantity, 0);
        const btn = document.createElement("button");
        btn.className = "tab-btn";
        btn.innerHTML = `${name} ${totalQty > 0 ? `<span class="tab-badge">${totalQty}</span>` : ""}`;
        btn.onclick = () => switchTab(name);
        wrapper.appendChild(btn);
        if (name !== "外帶 / 一般") {
            const closeBtn = document.createElement("button");
            closeBtn.className = "tab-close-btn";
            closeBtn.innerHTML = "×";
            closeBtn.title = "關閉此桌";
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`是否關閉/刪除桌號「${name}」？`)) {
                    delete openTabs[name];
                    if (activeTabName === name) {
                        switchTab("外帶 / 一般");
                    } else {
                        renderTabButtons();
                    }
                }
            };
            wrapper.appendChild(closeBtn);
        }
        listEl.appendChild(wrapper);
    });
}

// ======================================================
// 取得目前 IP
// ======================================================
async function getIP() {
    const cache = sessionStorage.getItem("myIP");
    if (cache) {
        return cache;
    }
    try {
        const res = await fetch("https://api.ipify.org?format=json");
        if (!res.ok) {
            throw new Error("IP API 連線失敗");
        }
        const data = await res.json();
        if (data.ip) {
            sessionStorage.setItem("myIP", data.ip);
            return data.ip;
        }
        return "";
    } catch (err) {
        console.error("取得 IP 失敗：", err);
        return "";
    }
}

// ======================================================
// 取得 GPS
// ======================================================
function getGPS() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ success: false, lat: "", lng: "", accuracy: "" });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    success: true,
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                console.warn("GPS 取得失敗：", error);
                resolve({ success: false, lat: "", lng: "", accuracy: "" });
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    });
}

// ======================================================
// ⭐ 查歌單權限驗證
// ======================================================
async function checkSongAccess() {
    const btn = document.getElementById("checkSongBtn");
    if (!btn || btn.disabled) return;
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "驗證中...";
    try {
        const userIP = await getIP();
        const gps = await getGPS();
        console.log("目前 IP：", userIP);
        console.log("目前 GPS：", gps);
        const params = new URLSearchParams();
        params.append("action", "checkSongAccess");
        params.append("storeCode", POS_STORE);
        params.append("ip", userIP);
        if (gps.success) {
            params.append("lat", gps.lat);
            params.append("lng", gps.lng);
            params.append("accuracy", gps.accuracy);
        }
        const res = await fetch(`${API_URL}?${params.toString()}`);
        if (!res.ok) {
            throw new Error("伺服器連線失敗");
        }
        const data = await res.json();
        console.log("歌單驗證結果：", data);
        if (data.status === "success") {
            console.log("歌單驗證成功", data);
            window.open("https://excdl.github.io/songs/", "_blank", "noopener,noreferrer");
        } else {
            alert(data.message || "目前 IP 或 GPS 不符合公司據點");
        }
    } catch (err) {
        console.error("歌單驗證錯誤：", err);
        alert("歌單驗證失敗\n\n請確認網路連線及定位權限。");
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

document.getElementById("checkSongBtn").addEventListener("click", checkSongAccess);

// ======================================================
// 登入時間
// ======================================================
function updateLoginTime() {
    const now = new Date();
    document.getElementById("loginTime").innerText = `登入時間：${now.toLocaleString("zh-TW", { hour12: false })}`;
}

// ======================================================
// 登入
// ======================================================
async function login() {
    const loginBtn = document.getElementById("loginBtn");
    loginBtn.innerText = "登入中...";
    loginBtn.disabled = true;
    const store = document.getElementById("storeInput").value;
    const pwd = document.getElementById("passwordInput").value;
    const userIP = await getIP();
    try {
        const res = await fetch(`${API_URL}?action=login&store=${encodeURIComponent(store)}&pwd=${encodeURIComponent(pwd)}&ip=${encodeURIComponent(userIP)}`);
        const data = await res.json();
        if (data.status === "success") {
            POS_STORE = data.storeCode;
            document.getElementById("loginPage").style.display = "none";
            document.getElementById("posApp").style.display = "flex";
            document.getElementById("storeInfo").innerText = `${data.storeName}（${data.storeCode}）`;
            updateLoginTime();
            setInterval(updateLoginTime, 1000);
            fetchProducts();
            fetchSalesList();
            updateTodaySales();
            setTimeout(() => {
                const cashBtn = document.querySelector('#paymentButtons .payBtn[data-pay="現金"]');
                if (cashBtn) {
                    cashBtn.click();
                }
            }, 0);
            renderTabButtons();
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

// ======================================================
// 登出
// ======================================================
async function logout() {
    const logoutBtn = document.getElementById("logoutBtn");
    logoutBtn.disabled = true;
    logoutBtn.innerText = "登出中...";
    logoutBtn.classList.add("active");
    const now = new Date();
    const logoutTime = now.toLocaleString("zh-TW", { hour12: false });
    try {
        await fetch(`${API_URL}?action=logout&store=${encodeURIComponent(POS_STORE)}&time=${encodeURIComponent(logoutTime)}`);
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
        logoutBtn.disabled = false;
        logoutBtn.innerText = "登出";
        logoutBtn.classList.remove("active");
    }
}

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("logoutBtn").addEventListener("click", logout);

// ======================================================
// 商品
// ======================================================
async function fetchProducts() {
    const res = await fetch(API_URL + "?action=products");
    products = await res.json();
    categories = [...new Set(products.map(x => x["類別"]))];
    renderCategories();
    if (categories.length > 0) {
        renderProducts(categories[0]);
    }
}

// ======================================================
// 業代
// ======================================================
async function fetchSalesList() {
    try {
        const res = await fetch(`${API_URL}?action=salesList&storeCode=${encodeURIComponent(POS_STORE)}`);
        const data = await res.json();
        if (data.status !== "success") {
            return;
        }
        const listEl = document.getElementById("salesList");
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

// ======================================================
// 分類
// ======================================================
function renderCategories() {
    const box = document.getElementById("posCategories");
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
    if (firstBtn) {
        firstBtn.classList.add("active");
    }
}

// ======================================================
// 商品搜尋
// ======================================================
document.getElementById("searchBox").oninput = function() {
    renderProducts(null, this.value.trim().toLowerCase());
};

// ======================================================
// 數字
// ======================================================
function parseNumber(str) {
    return Number(str.replace(/,/g, ""));
}

// ======================================================
// 存酒商品暫存
// ======================================================
let pendingStoreProduct = null;

// ======================================================
// 商品顯示
// ======================================================
function renderProducts(category = null, search = "") {
    const box = document.getElementById("posProducts");
    box.innerHTML = "";
    products
        .filter(p => {
            if (category && p["類別"] !== category) {
                return false;
            }
            if (search && !p["商品名稱"].toLowerCase().includes(search.toLowerCase())) {
                return false;
            }
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

// ======================================================
// 存酒視窗
// ======================================================
function openStoreWineModal(product) {
    pendingStoreProduct = product;
    document.getElementById("storeWineTitle").innerText = `【${product["商品名稱"]}】`;
    document.getElementById("storeWineModal").style.display = "flex";
}

// ======================================================
// 確認存酒
// ======================================================
function confirmStoreWine(isStore) {
    if (!pendingStoreProduct) {
        return;
    }
    addPOSItem(pendingStoreProduct, isStore);
    pendingStoreProduct = null;
    document.getElementById("storeWineModal").style.display = "none";
}

// ======================================================
// 加入購物車
// ======================================================
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
    renderTabButtons();
}

// ======================================================
// 付款按鈕
// ======================================================
function initPOSButtons() {
    const buttons = document.querySelectorAll("#paymentButtons .payBtn");
    buttons.forEach(btn => {
        btn.addEventListener("click", function() {
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

// ======================================================
// 購物車
// ======================================================
function renderCart() {
    const box = document.getElementById("posCart");
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
            <span class="price" onclick="openEditModal(${i},'price')">
                ${item.price}
            </span>
            <span class="subtotal">
                ${formatNumber(Math.round(sub))}
            </span>
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
    let subtotalOrMin = Math.max(baseAmount + corkageAmount, afterTax);
    let receivable = Math.max(subtotalOrMin - discountValue, 0);
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
        if (alertEl) {
            alertEl.style.display = "block";
        }
        posTotalEl.style.color = "#c0392b";
        checkoutBtn.classList.add("minAlert");
    } else {
        if (alertEl) {
            alertEl.style.display = "none";
        }
        posTotalEl.style.color = "#2c3e50";
        checkoutBtn.classList.remove("minAlert");
    }
}

// ======================================================
// 找零
// ======================================================
function updateChange() {
    const paymentMethod = document.getElementById("posPayment").value;
    const cash = Number(document.getElementById("cashInput").value) || 0;
    const totalEl = document.getElementById("posTotal");
    const receivable = Number(totalEl.dataset.value || totalEl.innerText.replace(/,/g, "")) || 0;
    const change = paymentMethod === "現金" ? Math.max(cash - receivable, 0) : 0;
    document.getElementById("changeOut").innerText = formatNumber(change);
}

// ======================================================
// 查存酒
// ======================================================
document.getElementById("checkWineBtn").addEventListener("click", () => {
    window.open("https://excdl.github.io/wine/", "_blank");
});

// ======================================================
// 折扣
// ======================================================
document.getElementById("discount").addEventListener("input", () => {
    saveCurrentTabState();
    renderCart();
});

// ======================================================
// 現金
// ======================================================
document.getElementById("cashInput").addEventListener("input", updateChange);

// ======================================================
// 今日營業額
// ======================================================
async function updateTodaySales() {
    const now = new Date();
    const formatDate = now.getFullYear() + "/" + String(now.getMonth() + 1).padStart(2, "0") + "/" + String(now.getDate()).padStart(2, "0");
    try {
        const res = await fetch(`${API_URL}?action=todaySales&storeCode=${encodeURIComponent(POS_STORE)}&date=${encodeURIComponent(formatDate)}`);
        const data = await res.json();
        if (data.status === "success") {
            document.getElementById("todaySalesDisplay").innerHTML = `<b>今日營業概況</b>
—————————————
總額：${data.total.toFixed(0)} 元
現金：${data.cash.toFixed(0)} 元
刷卡：${data.credit.toFixed(0)} 元
Line Pay：${data.linePay.toFixed(0)} 元`;
        }
    } catch (err) {
        console.error("更新今日營業額錯誤", err);
    }
}

setInterval(updateTodaySales, 30000);

// ======================================================
// 交班
// ======================================================
document.getElementById("shiftEndBtn").onclick = async function() {
    if (posCart.length > 0 && !confirm("購物車尚有無結帳商品，是否仍交班？")) {
        return;
    }
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
    alert(`交班成功！\n本班總營業額：${data.total} 元\n現金：${data.cash} 元\n刷卡：${data.credit} 元\nLine Pay：${data.linePay} 元`);
    posCart = [];
    openTabs = {
        "外帶 / 一般": {
            cart: [],
            people: 1,
            minConsume: 400,
            sales: "",
            discount: ""
        }
    };
    switchTab("外帶 / 一般");
    updateTodaySales();
};

// ======================================================
// 每日營業額按鈕
// ======================================================
document.getElementById("dailySalesBtn").onclick = updateTodaySales;

// ======================================================
// 刪除商品
// ======================================================
function removeItem(i) {
    posCart.splice(i, 1);
    renderCart();
    renderTabButtons();
}

// ======================================================
// 折扣鍵盤
// ======================================================
document.getElementById("discount").onclick = () => {
    openPOSKeypad("discount", document.getElementById("discount").value);
};

// ======================================================
// 現金鍵盤
// ======================================================
document.getElementById("cashInput").onclick = () => {
    openPOSKeypad("cash", document.getElementById("cashInput").value);
};

// ======================================================
// 商品編輯視窗
// ======================================================
function openEditModal(index, field) {
    editIndex = index;
    editingField = field;
    modalType = "edit";
    const modal = document.getElementById("editModal");
    const promoDiv = document.getElementById("promoButtons");
    const numpad = document.getElementById("numpad");
    const modalActions = document.querySelector("#editModal .modalActions");
    const modalInput = document.getElementById("modalInput");
    promoDiv.style.display = "none";
    document.getElementById("editCloseBtn").style.display = "none";
    if (field === "discount" || field === "cash") {
        kpTarget = field;
        document.getElementById("posKeypadTitle").innerText = field === "discount" ? "輸入折扣" : "收現金";
        document.getElementById("posKeypadInput").value = field === "discount" ? document.getElementById("discount").value : document.getElementById("cashInput").value || "";
        document.getElementById("posKeypadModal").style.display = "flex";
        return;
    }
    numpad.style.display = "grid";
    modalInput.style.display = "block";
    modalInput.readOnly = false;
    modalActions.style.display = "flex";
    modalInput.value = posCart[index]?.[field] ?? "";
    document.getElementById("modalProductName").innerText = "輸入";
    modal.style.display = "flex";
}

// ======================================================
// 優惠視窗
// ======================================================
function openPromoModal(item) {
    modalType = "promo";
    editIndex = null;
    const modal = document.getElementById("editModal");
    const promoDiv = document.getElementById("promoButtons");
    document.getElementById("numpad").style.display = "none";
    document.getElementById("modalInput").style.display = "none";
    promoDiv.style.display = "grid";
    promoDiv.innerHTML = "";
    document.querySelector("#editModal .modalActions").style.display = "none";
    document.getElementById("editCloseBtn").style.display = "block";
    const promoList = [
        { name: "95折", rate: 0.95 },
        { name: "9折", rate: 0.9 },
        { name: "85折", rate: 0.85 },
        { name: "8折", rate: 0.8 },
        { name: "7折", rate: 0.7 },
        { name: "6折", rate: 0.6 },
        { name: "買一送一", type: "買一送一" },
        { name: "買二送一", type: "買二送一" },
        { name: "第二件減10", type: "第二件減10" },
        { name: "第二件6折", type: "第二件6折" }
    ];
    promoList.forEach(p => {
        const btn = document.createElement("button");
        btn.innerText = p.name;
        btn.onclick = () => {
            let idx = posCart.findIndex(x => x.name === item.name);
            if (idx === -1) {
                addPOSItem(item);
            }
            idx = posCart.findIndex(x => x.name === item.name);
            if (idx !== -1) {
                posCart[idx].discount = p.type ? { type: p.type } : { rate: p.rate, type: "折扣" };
            }
            closeModal();
            renderCart();
            renderTabButtons();
        };
        promoDiv.appendChild(btn);
    });
    document.getElementById("modalProductName").innerText = item.name;
    modal.style.display = "flex";
}

// ======================================================
// 數字鍵盤
// ======================================================
function np(v) {
    document.getElementById("modalInput").value += v;
}

function backspace() {
    const input = document.getElementById("modalInput");
    input.value = input.value.slice(0, -1);
}

// ======================================================
// 確認商品編輯
// ======================================================
function confirmEdit() {
    const val = document.getElementById("modalInput").value;
    if (editIndex !== null && editingField === "quantity" && posCart[editIndex].unit === "斤") {
        const [j = 0, l = 0, q = 0] = val.split(".").map(Number);
        posCart[editIndex].quantity = j + l / 16 + q / 160;
    } else if (editIndex !== null) {
        posCart[editIndex][editingField] = Number(val);
    }
    closeModal();
    renderCart();
    renderTabButtons();
    saveCurrentTabState();
}

// ======================================================
// 關閉 Modal
// ======================================================
function closeModal() {
    document.getElementById("editModal").style.display = "none";
    document.getElementById("posKeypadModal").style.display = "none";
    document.querySelector("#editModal .modalActions").style.display = "flex";
    document.getElementById("modalInput").style.display = "block";
    document.getElementById("modalInput").readOnly = false;
    document.getElementById("numpad").style.display = "grid";
    document.getElementById("promoButtons").style.display = "none";
    document.getElementById("editCloseBtn").style.display = "none";
}

// ======================================================
// POS 鍵盤
// ======================================================
function openPOSKeypad(type, value = "0") {
    kpTarget = type;
    document.getElementById("posKeypadTitle").innerText = type === "discount" ? "折扣金額" : "收現金";
    document.getElementById("posKeypadInput").value = value;
    document.getElementById("posKeypadModal").style.display = "flex";
}

function kpInput(v) {
    const input = document.getElementById("posKeypadInput");
    if (input.value === "0") {
        input.value = "";
    }
    input.value += v;
}

function kpBack() {
    const input = document.getElementById("posKeypadInput");
    input.value = input.value.slice(0, -1);
    if (!input.value) {
        input.value = "0";
    }
}

function kpConfirm() {
    const v = document.getElementById("posKeypadInput").value;
    if (kpTarget === "discount") {
        document.getElementById("discount").value = v;
        saveCurrentTabState();
        renderCart();
    }
    if (kpTarget === "cash") {
        document.getElementById("cashInput").value = v;
        updateChange();
    }
    document.getElementById("posKeypadModal").style.display = "none";
}

// ======================================================
// 最低消費
// ======================================================
let allowMinConsumeCheckout = false;

function getMinConsumeTotal() {
    const people = Number(document.getElementById("peopleCount")?.value) || 0;
    const perMin = Number(document.getElementById("minConsumeInput")?.value) || 0;
    return people * perMin;
}

// ======================================================
// 最低消費事件
// ======================================================
document.getElementById("minConsumeInput").addEventListener("input", () => {
    saveCurrentTabState();
    renderCart();
});

document.getElementById("peopleCount").addEventListener("input", () => {
    saveCurrentTabState();
    renderCart();
});

document.getElementById("salesInput")?.addEventListener("input", saveCurrentTabState);

// ======================================================
// 最低消費確認
// ======================================================
function showMinConsumeConfirm(actual, min) {
    document.getElementById("minConsumeConfirmText").innerHTML = `實際消費 ${formatNumber(actual)} 元<br>低消 ${formatNumber(min)} 元<br>需補差 <b style="color:#c0392b">${formatNumber(min - actual)}</b> 元`;
    document.getElementById("minConsumeConfirm").style.display = "flex";
}

function cancelMinConsumeCheckout() {
    allowMinConsumeCheckout = false;
    document.getElementById("minConsumeConfirm").style.display = "none";
}

function confirmMinConsumeCheckout() {
    allowMinConsumeCheckout = true;
    document.getElementById("minConsumeConfirm").style.display = "none";
    document.getElementById("posCheckout").click();
}

// ======================================================
// 稅別
// ======================================================
function setTax(t) {
    currentTax = t;
    document.getElementById("taxIncluded").classList.toggle("active", t === "應稅");
    document.getElementById("taxExempt").classList.toggle("active", t === "免稅");
    renderCart();
}

window.addEventListener("DOMContentLoaded", () => {
    setTax("免稅");
    renderTabButtons();
});

// ======================================================
// 折扣顯示
// ======================================================
function formatDiscountRate(rate) {
    let d = rate * 100;
    let s = d.toString();
    if (d % 10 === 0) {
        s = (d / 10).toString();
    }
    return s + "折";
}

// ======================================================
// 計算折扣後小計
// ======================================================
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

// ======================================================
// 結帳送出
// ======================================================
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

    payload.storedItems = posCart.filter(it => it.isStored).map(it => {
        const product = products.find(p => p["商品名稱"] === it.name);
        const nowDate = new Date();
        return {
            customerName: document.getElementById("customerName").value,
            customerPhone: document.getElementById("customerPhone").value,
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

    await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

// ======================================================
// 結帳
// ======================================================
document.getElementById("posCheckout").onclick = async function() {
    const checkoutBtn = document.getElementById("posCheckout");
    if (checkoutBtn.disabled) {
        return;
    }
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
    if (posCart.length === 0) {
        alert("購物車是空的。");
        checkoutBtn.innerText = originalText;
        checkoutBtn.disabled = false;
        return;
    }
    let actual = parseNumber(document.getElementById("afterTax").innerText) - (Number(document.getElementById("discount").value) || 0);
    let min = getMinConsumeTotal();
    if (actual < min && !allowMinConsumeCheckout) {
        if (confirm(`您的消費金額為 ${actual} 元，低於最低消費額 ${min} 元，是否確認結帳？`)) {
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
    startCheckoutFlow(checkoutBtn, originalText);
};

// ======================================================
// 結帳流程
// ======================================================
async function startCheckoutFlow(checkoutBtn, originalText) {
    try {
        await sendCheckoutToSheet();
        setTimeout(updateTodaySales, 0);
        alert("結帳完成，已送出列印");
        posCart = [];
        openTabs[activeTabName] = {
            cart: [],
            people: 1,
            minConsume: 400,
            sales: "",
            discount: ""
        };
        if (document.getElementById("discount")) {
            document.getElementById("discount").value = "";
        }
        if (document.getElementById("cashInput")) {
            document.getElementById("cashInput").value = "";
        }
        if (document.getElementById("changeOut")) {
            document.getElementById("changeOut").innerText = "0";
        }
        if (document.getElementById("peopleCount")) {
            document.getElementById("peopleCount").value = "1";
        }
        if (document.getElementById("customerName")) {
            document.getElementById("customerName").value = "";
        }
        if (document.getElementById("customerPhone")) {
            document.getElementById("customerPhone").value = "";
        }
        if (document.getElementById("salesInput")) {
            document.getElementById("salesInput").value = "";
        }
        fetchSalesList();
        renderCart();
        renderTabButtons();
        document.querySelector('#paymentButtons .payBtn[data-pay="現金"]')?.click();
    } catch (error) {
        console.error("結帳錯誤：", error);
        alert("結帳失敗，請重試。");
    } finally {
        checkoutBtn.innerText = originalText;
        checkoutBtn.disabled = false;
    }
}
