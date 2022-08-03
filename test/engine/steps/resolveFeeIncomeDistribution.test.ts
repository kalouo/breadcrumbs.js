/** @jest-environment setup-polly-jest/jest-environment-node */

import BigNumber from "bignumber.js";
import { TezosToolkit } from "@taquito/taquito";

import client from "src/api-client";
import * as Polly from "test/helpers/polly";

import { generateConfig } from "test/helpers";
import {
  resolveBakerRewards,
  resolveDelegatorRewards,
  resolveExcludedDelegators,
  resolveFeeIncomeDistribution,
} from "src/engine/steps";

import { initializeCycleReport } from "src/engine/helpers";
import { EPaymentType } from "src/engine/interfaces";

describe("resolveFeeIncomeDistrubtion", () => {
  Polly.start();

  it("should not add any payments if no fee_income_recipients are given", async () => {
    const config = generateConfig({
      income_recipients: { fee_income: {} },
    });

    const cycleReport = initializeCycleReport(470);
    const cycleData = await client.getCycleData(config.baking_address, 470);

    const { cycleRewards: distributableRewards } = cycleData;

    const args = {
      config,
      cycleData,
      cycleReport,
      distributableRewards,
      tezos: {} as TezosToolkit,
      flags: {},
    };

    const input = resolveDelegatorRewards(
      resolveExcludedDelegators(resolveBakerRewards(args))
    );

    const output = resolveFeeIncomeDistribution(input);

    expect(output).toStrictEqual(input);
  });

  it("should create a payment equivalent to fee income if one fee_income_recipient is given", async () => {
    const recipientAddress = "tz1cZfFQpcYhwDp7y1njZXDsZqCrn2NqmVof";
    const config = generateConfig({
      income_recipients: {
        fee_income: { [recipientAddress]: 100 },
      },
    });
    const cycleData = await client.getCycleData(config.baking_address, 470);

    const args = {
      config,
      cycleData,
      cycleReport: initializeCycleReport(470),
      distributableRewards: cycleData.cycleRewards,
      tezos: {} as TezosToolkit,
      flags: {},
    };

    const input = resolveDelegatorRewards(
      resolveExcludedDelegators(resolveBakerRewards(args))
    );

    const {
      cycleReport: { feeIncomePayments },
    } = resolveFeeIncomeDistribution(input);

    expect(feeIncomePayments).toHaveLength(1);
    expect(feeIncomePayments[0].type).toEqual(EPaymentType.FeeIncome);
    expect(feeIncomePayments[0].recipient).toEqual(recipientAddress);
    expect(feeIncomePayments[0].amount).toEqual(input.cycleReport.feeIncome);
  });

  it("should split payments correctly if multiple fee_income_recipients are given", async () => {
    const feeIncomeRecpients = {
      tz1cZfFQpcYhwDp7y1njZXDsZqCrn2NqmVof: 40,
      tz1iCYywbfJEjb1h5Ew6hR8tr7CnbLVRWogm: 60,
    };
    const config = generateConfig({
      income_recipients: {
        fee_income: { ...feeIncomeRecpients },
      },
    });
    const cycleReport = initializeCycleReport(470);
    const cycleData = await client.getCycleData(config.baking_address, 470);

    const { cycleRewards: distributableRewards } = cycleData;

    const args = {
      config,
      cycleData,
      cycleReport,
      distributableRewards,
      tezos: {} as TezosToolkit,
      flags: {},
    };

    const input = resolveDelegatorRewards(
      resolveExcludedDelegators(resolveBakerRewards(args))
    );

    const {
      cycleReport: { feeIncomePayments },
    } = resolveFeeIncomeDistribution(input);

    expect(feeIncomePayments).toHaveLength(2);

    for (const payment of feeIncomePayments) {
      const share = feeIncomeRecpients[payment.recipient] / 100;

      const amount = new BigNumber(share)
        .times(input.cycleReport.feeIncome)
        .dp(0, BigNumber.ROUND_DOWN);

      expect(payment.amount).toStrictEqual(amount);
    }
  });
});
