# Breadcrumbs

### Overview

Breadcrumbs is a tool for Tezos validators (bakers :baguette_bread:) to pay their delegators.

### Objective

Reward payments from bakers to delegators are a cornerstone of Tezos' delegation-based liquid proof-of-stake model. `breadcrumbs` is a payment tool built with in the spirit of:

- increasing the choice of payout tools available and minimize dependency on single software stacks.
- establishing payout tool accessible to (and open to contribution from) the ecosystem of JS/TS developers.
- delivering life improvements to bakers continuously

### Features

- [x] Set a default service fee.
- [x] Set fees on a per-delegator basis.
- [x] Set separate payment addresses for given delegators.
- [x] Set minimum payment amounts.
- [x] Set minimum delegator balances.
- [x] Exclude given delegators from payment in case of overdelegation.
- [x] Protect the baker from overdelegation by ring-fencing 10% of the rewards.
- [x] Allow customized distribution of rewards associated with the baker's bond.
- [x] Allow customized distribution of fee income.

Roadmap:

- [ ] Telegram notifications.
- [ ] Twitter notifications.
- [ ] Run the payouts script on a Docker container in the background automagically.
- [ ] Persist reward data on a local PostgresDB for reporting usage.
- [ ] Pay rewards in FA2 tokens via built-in swaps.

... and more!

### Requirements

- Node 16

### Installation

Install dependencies by running the following command in the root directory:

```bash
$ npm i
# or
$ yarn install
```

### Configuration

1. Create a `.env` file as per `.env.template`
2. Create a configuration file with the `npm run configure` command line prompt.

### Usage

To run rewards for a given cycle:

```bash
$ npm run pay -- <cycle>
# or
$ yarn pay -- <cycle>
```

### Credits

This tool is powered by the [TzKT](https://tzkt.io) API and the [Tezos Taquito](https://tezostaquito.io/) library.
