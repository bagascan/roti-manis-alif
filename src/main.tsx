import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"

// Registrasi PWA sekarang dikelola di dalam App.tsx menggunakan hook useRegisterSW
// untuk memberikan kontrol notifikasi update yang lebih baik.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
