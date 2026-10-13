import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="shell">
      <p className="eyebrow">Vite Sandbox</p>
      <h1 data-testid="sandbox-title">预写 React 示例已运行</h1>
      <p>这个交互按钮用于证明 iframe 内的 React 应用不是静态截图。</p>
      <button data-testid="sandbox-counter" onClick={() => setCount((value) => value + 1)}>
        已点击 {count} 次
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
