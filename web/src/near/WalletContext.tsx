import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { actionCreators } from "@near-js/transactions";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CALL_GAS } from "./contract.js";
import { CONTRACT_ID, NETWORK } from "./config.js";

interface WalletState {
  accountId: string | null;
  ready: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
  /** Sign and send a function call to the BonaFide contract. */
  call: (methodName: string, args: Record<string, unknown>, deposit?: string) => Promise<void>;
}

const WalletCtx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    void (async () => {
      const sel = await setupWalletSelector({
        network: NETWORK,
        modules: [setupMyNearWallet(), setupMeteorWallet()],
      });
      const mdl = setupModal(sel, { contractId: CONTRACT_ID });
      setSelector(sel);
      setModal(mdl);
      const update = () => {
        const accounts = sel.store.getState().accounts;
        setAccountId(accounts.find((a) => a.active)?.accountId ?? accounts[0]?.accountId ?? null);
      };
      update();
      sub = sel.store.observable.subscribe(update);
    })();
    return () => sub?.unsubscribe();
  }, []);

  const state = useMemo<WalletState>(
    () => ({
      accountId,
      ready: selector !== null,
      signIn: () => modal?.show(),
      signOut: async () => {
        const wallet = await selector?.wallet();
        await wallet?.signOut();
        setAccountId(null);
      },
      call: async (methodName, args, deposit = "0") => {
        if (!selector) throw new Error("wallet not ready");
        const wallet = await selector.wallet();
        const action = actionCreators.functionCall(methodName, args, BigInt(CALL_GAS), BigInt(deposit));
        await wallet.signAndSendTransaction({ receiverId: CONTRACT_ID, actions: [action] });
      },
    }),
    [accountId, selector, modal],
  );

  return <WalletCtx.Provider value={state}>{children}</WalletCtx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
