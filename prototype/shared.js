function setActiveNav() {
  const path = (location.pathname || "").toLowerCase();
  const file = path.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const target = (a.getAttribute("href") || "").toLowerCase();
    if (target.endsWith(file)) a.classList.add("active");
    else a.classList.remove("active");
  });
}

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function show(el) {
  if (!el) return;
  el.classList.add("show");
}

function hide(el) {
  if (!el) return;
  el.classList.remove("show");
}

function toast({ type = "success", title = "完成", message = "" }) {
  const wrap = qs(".toast-wrap") || (() => {
    const w = document.createElement("div");
    w.className = "toast-wrap";
    document.body.appendChild(w);
    return w;
  })();

  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `
    <div>
      <b>${title}</b>
      ${message ? `<p>${message}</p>` : ""}
    </div>
    <button class="btn ghost small" data-close>关闭</button>
  `;
  wrap.appendChild(t);
  const close = () => {
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    setTimeout(() => t.remove(), 160);
  };
  t.querySelector("[data-close]")?.addEventListener("click", close);
  setTimeout(close, 3600);
}

function wireOverlay() {
  const overlay = qs("#overlay");
  if (!overlay) return;
  overlay.addEventListener("click", () => {
    qsa(".modal.show").forEach(hide);
    qsa(".drawer.show").forEach(hide);
    hide(overlay);
  });
}

function openModal(id) {
  const overlay = qs("#overlay");
  const modal = qs(id);
  show(overlay);
  show(modal);
}

function closeModal(id) {
  const overlay = qs("#overlay");
  const modal = qs(id);
  hide(modal);
  if (!qsa(".modal.show").length && !qsa(".drawer.show").length) hide(overlay);
}

function openDrawer(id) {
  const overlay = qs("#overlay");
  const drawer = qs(id);
  show(overlay);
  show(drawer);
}

function closeDrawer(id) {
  const overlay = qs("#overlay");
  const drawer = qs(id);
  hide(drawer);
  if (!qsa(".modal.show").length && !qsa(".drawer.show").length) hide(overlay);
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveNav();
  wireOverlay();
  qsa("[data-action='toast-success']").forEach((b) =>
    b.addEventListener("click", () =>
      toast({ type: "success", title: "操作成功", message: "变更已应用，可继续下一步。" })
    )
  );
  qsa("[data-action='toast-error']").forEach((b) =>
    b.addEventListener("click", () =>
      toast({ type: "error", title: "请求失败", message: "请检查依赖或网络后重试。" })
    )
  );
});

