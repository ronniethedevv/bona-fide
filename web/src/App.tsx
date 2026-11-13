import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { Cosign } from "./pages/Cosign.js";
import { ConnectKey } from "./pages/ConnectKey.js";
import { Directory } from "./pages/Directory.js";
import { Docs } from "./pages/Docs.js";
import { ForProjects } from "./pages/ForProjects.js";
import { KeyCheck } from "./pages/KeyCheck.js";
import { Landing } from "./pages/Landing.js";
import { MandatePage } from "./pages/MandatePage.js";
import { MmProfile } from "./pages/MmProfile.js";
import { NewMandate } from "./pages/NewMandate.js";

function NotFound() {
  return (
    <section>
      <h1>Not found</h1>
      <p className="muted">That page does not exist. The directory lists every market maker on the record.</p>
      <p>
        <Link to="/directory" className="btn">
          Go to the directory
        </Link>
      </p>
    </section>
  );
}

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/for-projects" element={<ForProjects />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/mm/:account" element={<MmProfile />} />
        <Route path="/mandate/:id" element={<MandatePage />} />
        <Route path="/mandate/:id/cosign" element={<Cosign />} />
        <Route path="/mandate/:id/key" element={<ConnectKey />} />
        <Route path="/new" element={<NewMandate />} />
        <Route path="/key-check" element={<KeyCheck />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
