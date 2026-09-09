let posCart = [];
let openTabs = {};          // 儲存各桌未結帳暫存資料 { "A01": { cart: [...], ... } }
let currentTableNo = "";    // 目前操作中的桌號

// 全域商品與分類資料（會從 Google Sheet 動態填入）
let products = [];
let categories = ["全部"];

document.addEventListener("DOMContentLoaded", () => {
    // ⭐ 當頁面載入時，直接呼叫您原本讀取 Google 試算表的函式
    loadGoogleSheetProducts();
    renderCart();
    renderActiveTablesBar();
});

// ==========================================
// 1. 讀取 Google 試算表商品清單的範例函式
// ==========================================
function loadGoogleSheetProducts() {
    // 這裡替換成您原本用來讀取 Google Sheet 的網址或 API
    // 例如：fetch('您的Google Apps Script 網址')
    //     .then(res => res.json())
    //     .then(data => { ... });

    // 以下為示意，假設您從 Sheet 取得資料後，處理成陣列：
    /*
    products = data.map(item => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        category: item.category
    }));
    */

    // 萃取出不重複的分類
    // const uniqueCats = [...new Set(products.map(p => p.category))];
    // categories = ["全部", ...uniqueCats];

    // renderCategories();
    // renderProducts(products);
}

// 渲染分類按鈕
function renderCategories() {
    const catList = document.getElementById("categoryList");
    if (!catList) return;
    catList.innerHTML = "";
    categories.forEach((cat, index) => {
        const btn = document.createElement("button");
        btn.innerText = cat;
        if (index === 0) btn.classList.add("active");
        btn.onclick = () => {
            document.querySelectorAll("#categoryList button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            filterProducts(cat);
        };
        catList.appendChild(btn);
    });
}

// 篩選商品
function filterProducts(category) {
    if (category === "全部") {
        renderProducts(products);
    } else {
        renderProducts(products.filter(p => p.category === category));
    }
}

// 渲染商品卡片
function renderProducts(list) {
    const prodContainer = document.getElementById("posProducts");
    if (!prodContainer) return;
    prodContainer.innerHTML = "";
    list.forEach(p => {
        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `<h4>${p.name}</h4><p>$${p.price}</p>`;
        card.onclick = () => addToCart(p);
        prodContainer.appendChild(card);
    });
}

// 加入購物車
function addToCart(product) {
    const existing = posCart.find(item => item.id === product.id);
    if (existing) {
        existing.quantity += 1;
    } else {
        posCart.push({ ...product, quantity: 1 });
    }
    renderCart();
}

// 渲染購物車畫面與計算金額
function renderCart() {
    const cartContainer = document.getElementById("posCart");
    if (!cartContainer) return;
    cartContainer.innerHTML = "";
    
    let subTotal = 0;
    posCart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        subTotal += itemTotal;

        const row = document.createElement("div");
        row.className = "cartRow";
        row.innerHTML = `
            <span class="name">${item.name}</span>
            <span>${item.price}</span>
            <span><button onclick="changeQty(${index}, -1)">-</button> ${item.quantity} <button onclick="changeQty(${index}, 1)">+</button></span>
            <span>${itemTotal}</span>
            <span><button onclick="removeFromCart(${index})" style="background:#e74c3c;color:white;border:none;border-radius:4px;padding:2px 6px;">X</button></span>
        `;
        cartContainer.appendChild(row);
    });

    if(document.getElementById("subTotalOut")) document.getElementById("subTotalOut").innerText = subTotal;
    if(document.getElementById("grandTotalOut")) document.getElementById("grandTotalOut").innerText = subTotal;
}

function changeQty(index, delta) {
    posCart[index].quantity += delta;
    if (posCart[index].quantity <= 0) {
        posCart.splice(index, 1);
    }
    renderCart();
}

function removeFromCart(index) {
    posCart.splice(index, 1);
    renderCart();
}

// ==========================================
// 2. 桌號暫存與加點管理核心（保持不變）
// ==========================================

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
        peopleCount: document.getElementById("peopleCount")?.value || 1,
        minConsume: document.getElementById("minConsumeInput")?.value || 400,
        salesName: document.getElementById("salesInput")?.value || ""
    };

    currentTableNo = tableNo;
    alert(`【桌號 ${tableNo}】點單已成功暫存！`);
    
    clearPOSScreenKeepTable();
    renderActiveTablesBar();
}

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

function clearPOSScreenKeepTable() {
    posCart = [];
    currentTableNo = "";
    if (document.getElementById("tableNoInput")) document.getElementById("tableNoInput").value = "";
    renderCart();
}

function renderActiveTablesBar() {
    const listEl = document.getElementById("tablesBarList");
    if (!listEl) return;

    const keys = Object.keys(openTabs);
    if (keys.length === 0) {
        listEl.innerHTML = `<span style="color:#888;">(目前無暫存桌)</span>`;
        return;
    }

    listEl.innerHTML = "";
    keys.forEach(tNo => {
        const itemCount = openTabs[tNo].cart.reduce((sum, item) => sum + item.quantity, 0);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerHTML = `桌 ${tNo} <span style="background:#e74c3c; color:white; padding:1px 4px; border-radius:6px; font-size:10px;">${itemCount}品</span>`;
        
        if (currentTableNo === tNo) {
            btn.style.background = "#3498db";
            btn.style.color = "white";
        }

        btn.onclick = () => loadTableTab(tNo);
        listEl.appendChild(btn);
    });
}

function startCheckoutFlow() {
    if (posCart.length === 0) {
        alert("購物車無商品，無法結帳！");
        return;
    }

    const tableNo = document.getElementById("tableNoInput").value.trim();
    const total = document.getElementById("grandTotalOut").innerText;

    if (!confirm(`確認要為【桌號：${tableNo || "散客"}】結帳，總金額 $${total} 嗎？`)) {
        return;
    }

    // 結帳成功，清除該桌的暫存記錄
    if (currentTableNo && openTabs[currentTableNo]) {
        delete openTabs[currentTableNo];
    }
    
    alert("結帳成功！");
    clearPOSScreenKeepTable();
    renderActiveTablesBar();
}

function handleLogout() {
    alert("已登出系統");
}

function closeModal() { document.getElementById("editModal").style.display = "none"; }
function numpadInput(val) {}
function confirmModal() {}
