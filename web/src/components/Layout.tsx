import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { CONTRACT_ID, NETWORK } from "../near/config.js";
import { useWallet } from "../near/WalletContext.js";

const NAV = [
  { to: "/directory", label: "Directory" },
  { to: "/new", label: "New mandate" },
  { to: "/for-projects", label: "For projects" },
  { to: "/key-check", label: "Key check" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { accountId, signIn, signOut } = useWallet();
  const isLanding = useLocation().pathname === "/";

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">
            BonaFide
            <span className="brand-net">NEAR {NETWORK}</span>
          </Link>
          <nav className="topnav">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "is-active" : "")}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="spacer" />
          {accountId ? (
            <div className="wallet">
              <span className="account" title={accountId}>
                {accountId}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <button className="btn" onClick={signIn}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      {!CONTRACT_ID && (
        <div className="banner banner-warn">
          <code>VITE_CONTRACT_ID</code> is not set — views will not load. Set it in <code>.env</code>.
        </div>
      )}

      <main className={isLanding ? "main-landing" : "container content"}>{children}</main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>Deterministic scoring · attested agent · append-only record on NEAR.</span>
          <div className="spacer" />
          <a href="https://github.com/ronniethedevv/bona-fide" target="_blank" rel="noreferrer">
            Source
          </a>
          <a
            href="https://github.com/ronniethedevv/bona-fide/tree/main/evidence"
            target="_blank"
            rel="noreferrer"
          >
            Evidence
          </a>
          {CONTRACT_ID && (
            <a href={`https://testnet.nearblocks.io/address/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
              Contract
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
