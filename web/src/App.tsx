import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { Cosign } from "./pages/Cosign.js";
import { ConnectKey } from "./pages/ConnectKey.js";
import { Directory } from "./pages/Directory.js";
import { KeyCheck } from "./pages/KeyCheck.js";
import { MandatePage } from "./pages/MandatePage.js";
import { MmProfile } from "./pages/MmProfile.js";
import { NewMandate } from "./pages/NewMandate.js";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Directory />} />
        <Route path="/mm/:account" element={<MmProfile />} />
        <Route path="/mandate/:id" element={<MandatePage />} />
        <Route path="/mandate/:id/cosign" element={<Cosign />} />
        <Route path="/mandate/:id/key" element={<ConnectKey />} />
        <Route path="/new" element={<NewMandate />} />
        <Route path="/key-check" element={<KeyCheck />} />
        <Route path="*" element={<p className="muted">Not found.</p>} />
      </Routes>
    </Layout>
  );
}
