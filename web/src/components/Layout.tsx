import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CONTRACT_ID } from "../near/config.js";
import { useWallet } from "../near/WalletContext.js";

export function Layout({ children }: { children: ReactNode }) {
  const { accountId, signIn, signOut } = useWallet();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Bona&nbsp;Fide
        </Link>
        <nav className="topnav">
          <Link to="/">Directory</Link>
          <Link to="/new">New mandate</Link>
        </nav>
        <div className="spacer" />
        {accountId ? (
          <div className="wallet">
            <span className="account" title={accountId}>
              {accountId}
            </span>
            <button className="btn btn-ghost" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : (
          <button className="btn" onClick={signIn}>
            Connect wallet
          </button>
        )}
      </header>
      {!CONTRACT_ID && (
        <div className="banner banner-warn">
          <code>VITE_CONTRACT_ID</code> is not set — views will not load. Set it in <code>.env</code>.
        </div>
      )}
      <main className="content">{children}</main>
      <footer className="footer">
        Deterministic scoring · attested agent · append-only record on NEAR.
      </footer>
    </div>
  );
}
