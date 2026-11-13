# For token projects

The rest of this repository is written from the market maker's side, because
that is who hands over a key and whose record gets built. This is the same
system from the other side: you are the one paying, lending, and currently
taking someone's word for how it went.

## What you get, and what you give up

You get a record of whether the market maker kept the terms you agreed, scored
by code you can read, on a chain you do not have to trust anyone about.

You do not get their order book. That is the point, not a limitation. A market
maker who would hand you their book would be handing it to their other clients'
competitors too, which is why the incumbent answer to "prove it" is "no".

You also do not get to choose the scoring after the fact. The terms are hashed
when the mandate is created and every verdict binds to that hash, so neither
side can quietly move the goalposts. If you want different thresholds, you
agree them before, not after.

## The sequence

1. **You agree terms with the market maker** off-chain, as you would anyway:
   maximum spread, minimum depth per side, minimum uptime, how much of the
   loaned token may be sold per epoch, how long an epoch is.
2. **The market maker proposes the mandate**, naming your account as the
   project. They do this, not you: the contract makes whoever calls
   `propose_mandate` the market maker, so a mandate you create yourself would
   record *you* as the market maker. If that happened, cancel it and have them
   propose.
3. **You co-sign it.** Open the mandate, read the terms back, and co-sign from
   your project wallet. This is the step that makes the record mean anything:
   the contract only accepts a co-signature from the account the terms name as
   the project, so nobody can vouch for themselves. Until you co-sign, nothing
   is scored.
4. **The market maker connects a read-only key**, sealed in their browser to a
   key that exists only inside the enclave. You never see it and neither do we.
5. **Verdicts appear, one per epoch.** Pass, Fail with reasons, Outage, or
   Missed. You read them on the mandate page or straight off the chain.

## Before step 3: you must be allowlisted

In this phase the project allowlist is controlled by the contract owner. Your
account has to be on it before you can co-sign, and the co-sign page tells you
if it is not rather than letting you sign and fail.

This is a real limitation, stated plainly in
[the trust limits](../README.md#trust-limits-read-these): a registry someone
controls is a registry someone can abuse. It exists because the alternative in
a v1 is letting any account declare itself a project, which makes a
co-signature worthless. Fixing it properly, rather than moving the trust
somewhere less visible, is the open problem.

## Reading a verdict

A **Pass** means every metric met the terms for that epoch. A **Fail** carries
its reasons, for example `LOAN_CAP` when more of the loaned token was sold than
the terms allow, and the numbers behind it: median spread, minimum depth each
side, uptime, net sells, withdrawals.

Two things you should treat differently from a Fail:

- **Missed** means an epoch has no verdict and the grace period has passed.
  Anyone can record one, including you. Silence is not a clean record.
- **Outage** means the key stopped working or the exchange was unreachable.
  Honest, but it is also what a market maker would do if they wanted the
  scoring to stop, which is why it is recorded rather than ignored.

## What you should check before you believe any of it

A market maker's own account appearing in the directory proves nothing about
them, and the directory says so. What matters is who co-signed. If a mandate's
market maker and project are the same account, the app flags it, because that
is self-dealing rather than a counterparty.

The README's
[how to check this without trusting us](../README.md#how-to-check-this-without-trusting-us)
applies to you more than to a judge: you are the party with money at risk. Read
the chain directly, and recompute a verdict yourself.

## What this does not cover

- **One key shows one account.** A verdict proves what happened in the account
  the terms committed to. Balance reconciliation catches value leaving it by
  unreported routes, but it cannot prove the market maker has no other
  accounts. Identity binding exists to tie a NEAR account to an exchange
  account; it is live on the contract, and no mandate is bound yet.
- **The exchange is a trusted oracle.** The enclave attests its computation
  over what the exchange reported. It cannot prove the exchange reported
  truthfully.
- **Scoring is not a legal opinion.** It tells you whether the numbers met the
  terms. Whether that is the deal you thought you made is still your call.
