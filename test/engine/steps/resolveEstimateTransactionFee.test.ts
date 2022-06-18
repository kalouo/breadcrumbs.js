/** @jest-environment setup-polly-jest/jest-environment-node */
import { TezosToolkit } from "@taquito/taquito";

import client from "src/api-client";

import {
  resolveBakerRewards,
  resolveDelegatorRewards,
  resolveExcludedPaymentsByContext,
  resolveExcludedDelegators,
  resolveEstimateTxFees,
} from "src/engine/steps";
import { initializeCycleReport } from "src/engine/helpers";

import * as Polly from "test/helpers/polly";
import { generateConfig } from "test/helpers";
import BigNumber from "bignumber.js";

describe("resolveExcludedPaymentsByContext", () => {
  Polly.start();
  const provider = new TezosToolkit("https://ithacanet.ecadinfra.com");

  let mockProvider;

  beforeEach(() => {
    mockProvider = jest.spyOn(provider.estimate, "batch");
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("adds gas limit, storage limit and transaction fee data to the payments object", async () => {
    const config = generateConfig();

    const cycleReport = initializeCycleReport(470);
    const cycleData = await client.getCycleData(config.baking_address, 470);

    const { cycleRewards: distributableRewards } = cycleData;

    const args = {
      config,
      cycleData,
      cycleReport,
      distributableRewards,
    };

    const input = resolveExcludedPaymentsByContext(
      resolveDelegatorRewards(
        resolveExcludedDelegators(resolveBakerRewards(args))
      )
    );

    mockProvider.mockResolvedValue(
      input.cycleReport.delegatorPayments.map((_item, index) => ({
        gasLimit: index,
        storageLimit: index + 1,
        totalCost: index + 2,
      }))
    );

    const output = await resolveEstimateTxFees(input, { tezos: provider });

    for (const [
      index,
      payment,
    ] of output.cycleReport.delegatorPayments.entries()) {
      expect(payment.gasLimit).toEqual(index);
      expect(payment.storageLimit).toEqual(index + 1);
      expect(payment.txFee).toStrictEqual(new BigNumber(index + 2));
    }
  });
});
