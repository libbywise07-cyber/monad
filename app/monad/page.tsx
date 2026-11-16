"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import WalletBar, { useWallet } from "@/components/WalletBar";
import { addressUrl, cartAddress, deployCart, friendlyError, registerStore, saveAddress, storeAddress, storeNameOf, txUrl, waitFor } from "@/lib/monad/client";
import { CHAIN_ID, EXPLORER, RPC_URL } from "@/lib/monad/config";
import type { Address } from "viem";

/** One-time setup: deploy CampusCart to Monad testnet and register the demo store wallet. */
export default function MonadSetup() {
  const w = useWallet();
  const [cart, setCart] = useState("");
  const [store, setStore] = useState("");
  const [storeName, setStoreName] = useState("Safeway · Franklin Blvd (CampusFuel partner)");
  const [registered, setRegistered] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [tx, setTx] = useState("");

  useEffect(() => {
    setCart(cartAddress());
    setStore(storeAddress());
  }, []);
  useEffect(() => {
    if (cart && store)
      storeNameOf(store as Address)
        .then((n) => setRegistered(n || null))
        .catch(() => setRegistered(null));
  }, [cart, store]);

  const run = async (what: string, fn: () => Promise<void>) => {
    setErr("");
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy("");
    }
  };

  const deploy = () =>
    run("deploy", async () => {
      const r = await deployCart(w.account!);
      saveAddress("cart", r.address);
      setCart(r.address);
      setTx(r.hash);
      w.refreshBalance();
    });

  const register = () =>
    run("register", async () => {
      const hash = await registerStore(w.account!, storeName.trim());
      setTx(hash);
      await waitFor(hash);
      saveAddress("store", w.account!);
      setStore(w.account!);
      setRegistered(storeName.trim());
    });

  return (
    <main className="wrap narrow">
      <nav className="row between" style={{ marginBottom: 14 }}>
        <Link href="/dashboard" className="btn sm">
          ← Back to plan
        </Link>
        <Link href="/store" className="btn sm ghost">
          Store dashboard
        </Link>
      </nav>
      <h1 style={{ fontSize: 30 }}>Monad setup</h1>
      <p className="muted">
        One time, about 2 minutes. You&apos;ll deploy the CampusCart contract to Monad testnet (chain {CHAIN_ID}) and register a wallet as the demo grocery store.
      </p>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>0. Wallet</h3>
        <WalletBar w={w} />
        <p className="small muted" style={{ margin: 0 }}>
          Need test MON? <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">faucet.monad.xyz</a>. Network {RPC_URL} · Explorer{" "}
          <a href={EXPLORER} target="_blank" rel="noreferrer">
            {EXPLORER.replace("https://", "")}
          </a>
        </p>
      </div>

      <div className="card stack" style={{ marginTop: 12 }}>
        <h3 style={{ margin: 0 }}>1. Deploy the CampusCart contract</h3>
        {cart ? (
          <p style={{ margin: 0 }}>
            ✅ Contract:{" "}
            <a className="mono" href={addressUrl(cart)} target="_blank" rel="noreferrer">
              {cart}
            </a>
          </p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Holds each order&apos;s payment until the student confirms they got it.</p>
        )}
        <div className="row">
          <button type="button" className={`btn sm ${cart ? "" : "primary"}`} disabled={!w.account || Boolean(busy)} onClick={deploy}>
            {busy === "deploy" ? (
              <>
                <span className="spinner" /> Deploying…
              </>
            ) : cart ? (
              "Deploy a fresh copy"
            ) : (
              "Deploy to Monad testnet"
            )}
          </button>
          <input
            aria-label="Existing contract address"
            placeholder="…or paste an existing contract address"
            value={cart}
            onChange={(e) => {
              setCart(e.target.value.trim());
              saveAddress("cart", e.target.value.trim());
            }}
            style={{ flex: 1, minWidth: 220 }}
          />
        </div>
      </div>

      <div className="card stack" style={{ marginTop: 12 }}>
        <h3 style={{ margin: 0 }}>2. Register the demo store</h3>
        <p className="small muted" style={{ margin: 0 }}>
          Use a <b>second MetaMask account</b> for the store, so you can play student and store in the demo. Switch accounts in MetaMask, then register.
        </p>
        {registered ? (
          <p style={{ margin: 0 }}>
            ✅ Store: <b>{registered}</b> ·{" "}
            <a className="mono" href={addressUrl(store)} target="_blank" rel="noreferrer">
              {store}
            </a>
          </p>
        ) : null}
        <div className="row">
          <input aria-label="Store name" value={storeName} onChange={(e) => setStoreName(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <button type="button" className="btn primary sm" disabled={!w.account || !cart || !storeName.trim() || Boolean(busy)} onClick={register}>
            {busy === "register" ? (
              <>
                <span className="spinner" /> Registering…
              </>
            ) : (
              "Register this wallet as the store"
            )}
          </button>
        </div>
      </div>

      {err ? <p className="err">{err}</p> : null}
      {tx ? (
        <p className="small">
          Last transaction:{" "}
          <a href={txUrl(tx)} target="_blank" rel="noreferrer">
            view on Monad explorer ↗
          </a>
        </p>
      ) : null}

      {cart && registered ? (
        <div className="card stack" style={{ marginTop: 12 }}>
          <h3 style={{ margin: 0 }}>3. Share it with every visitor</h3>
          <p className="small" style={{ margin: 0 }}>
            These addresses are saved in this browser. To make the live website use them too, add them in Vercel → Project → Settings → Environment Variables,
            then redeploy (or send them to your developer to put in <code>lib/monad/config.ts</code>):
          </p>
          <pre className="mono small code-box">{`NEXT_PUBLIC_CART_ADDRESS=${cart}\nNEXT_PUBLIC_STORE_ADDRESS=${store}`}</pre>
          <p className="small" style={{ margin: 0 }}>
            Then: switch MetaMask back to your student account → <Link href="/checkout">Checkout</Link>. Keep <Link href="/store">the store dashboard</Link> open in
            another window.
          </p>
        </div>
      ) : null}
    </main>
  );
}
