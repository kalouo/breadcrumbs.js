import { initializeCycleReport } from "src/engine/helpers";
import { join } from "path";
import client from "src/api-client";
import engine from "src/engine";
import { getConfig } from "src/config";
import {
  printBakerPaymentsTable,
  printDelegatorPaymentsTable,
  printDistributedPaymentsTable,
  printExcludedPaymentsTable,
} from "src/cli/print";
import {
  createProvider,
  prepareTransactionForSubmission,
  sendBatch,
} from "src/tezos-client";
import { globalCliOptions } from "src/cli/global";
import { writeCycleReport, writePaymentReport } from "src/fs-client";
import { unlink } from "fs/promises";
import inquirer from "inquirer";
import {
  BasePayment,
  DelegatorPayment,
  StepArguments,
} from "src/engine/interfaces";
import {
  REPORTS_FAILED_PAYMENTS_DIRECTORY,
  REPORTS_SUCCESS_PAYMENTS_DIRECTORY,
} from "src/utils/constants";
import { capitalize, every, flatten, isEmpty } from "lodash";
import { checkValidConfig, checkValidCycle } from "./helpers";
import { getExplorerUrl } from "src/utils/url";
import { EPayoutWalletMode } from "src/config/interfaces";
import { loadNotificationPlugin } from "src/plugin/notification";
import { getDataForPlugins } from "src/plugin/notification/helpers";

const writeReportAndSendNotifications = async (
  cycle: number,
  payments: {
    successfulPayments: Array<BasePayment>;
    failedPayments: Array<BasePayment>;
    excludedPayments: Array<BasePayment>;
  },
  result: StepArguments
) => {
  const { successfulPayments, failedPayments, excludedPayments } = payments;
  if (successfulPayments.length > 0) {
    await writePaymentReport(
      cycle,
      [...successfulPayments, ...excludedPayments],
      join(globalCliOptions.workDir, REPORTS_SUCCESS_PAYMENTS_DIRECTORY)
    );
  }
  if (failedPayments.length > 0) {
    await writePaymentReport(
      cycle,
      failedPayments,
      join(globalCliOptions.workDir, REPORTS_FAILED_PAYMENTS_DIRECTORY)
    );
  } else {
    // no failed payments remove old report if exists
    const reportPath = join(
      globalCliOptions.workDir,
      REPORTS_FAILED_PAYMENTS_DIRECTORY,
      `${cycle}.csv`
    );
    try {
      await unlink(reportPath);
    } catch {
      /** not found */
    }
  }

  await writeCycleReport(
    result.cycleReport,
    result.cycleData,
    "reports/cycle_summary/"
  );

  if (failedPayments.length === 0) {
    const data = getDataForPlugins(result.cycleData, result.cycleReport);

    for (const plugin of getConfig("notifications") ?? []) {
      try {
        console.log(`Sending notifications via ${capitalize(plugin.type)}`);
        const notificator = await loadNotificationPlugin(plugin);
        await notificator.notify(data);
        console.log(`${capitalize(plugin.type)} notifications sent`);
      } catch (e) {
        console.log(`Notification error: ${(e as Error).message}`);
      }
    }
  } else {
    console.log(`Failed payments detected. Notifications suppressed...`);
    process.exit(1);
  }
};

export const pay = async (commandOptions) => {
  const cycle = commandOptions.cycle ?? (await client.getLastCompletedCycle());
  await checkValidCycle(client, cycle);

  if (globalCliOptions.dryRun) {
    console.log(`Running in 'dry-run' mode...`);
  }

  const config = getConfig();
  await checkValidConfig(config);

  console.log(`Working on cycle ${cycle}...`);

  const cycleReport = initializeCycleReport(cycle);
  const cycleData = await client.getCycleData(config.baking_address, cycle);

  const provider = await createProvider(config);

  const result = await engine.run({
    config,
    cycleReport,
    cycleData,
    distributableRewards: cycleData.cycleRewards,
    tezos: provider,
  });

  const { batches, creditablePayments, excludedPayments, distributedPayments } =
    result.cycleReport;

  /* The last two batches are related to fee income and bond rewards */
  const delegatorPayments = flatten(batches.slice(0, -2));
  const bakerPayments = flatten(batches.slice(-2));

  if (!isEmpty(distributedPayments)) {
    console.log("\nPAYMENTS PREVIOUSLY DISTRIBUTED:");
    printDistributedPaymentsTable(distributedPayments as DelegatorPayment[]);
  }

  if (
    !isEmpty(config.accounting_mode ? creditablePayments : excludedPayments)
  ) {
    console.log("\nPAYMENTS EXCLUDED:");
    printExcludedPaymentsTable(
      config.accounting_mode ? creditablePayments : excludedPayments
    );
  }

  if (!isEmpty(delegatorPayments)) {
    console.log("\nPENDING DELEGATOR PAYMENTS:");
    printDelegatorPaymentsTable(delegatorPayments as DelegatorPayment[]);
  }

  if (!isEmpty(bakerPayments)) {
    console.log("\nPENDING BAKER PAYMENTS:");
    printBakerPaymentsTable(bakerPayments);
  }

  console.log("\n");

  if (config.accounting_mode) {
    /* TO DO: persist creditablePayments  */
  }

  if (globalCliOptions.dryRun) {
    if (isEmpty(batches) || every(batches, (batch) => isEmpty(batch))) {
      console.log("There is noting to pay for this cycle.");
    }
    if (result.flags?.insufficientBalance) {
      console.log(
        "NOTE: Balance is insufficient. Transaction fees not estimated."
      );
    }

    process.exit(0);
  }

  if (result.flags?.insufficientBalance) {
    console.log("Insufficient balance to make payments. Aborting ...");
    console.log("NOTE: Transaction fees have not been estimated.");
    process.exit(1);
  }

  if (isEmpty(batches) || every(batches, (batch) => isEmpty(batch))) {
    if (result.flags.successfulTransactionInFailed) {
      console.log(`Found misreported sucessful payments. Rewriting report...`);
      await writeReportAndSendNotifications(
        cycle,
        {
          successfulPayments: distributedPayments,
          failedPayments: [],
          excludedPayments,
        },
        result
      );
    }
    console.log("Nothing to pay. Aborting...");
    process.exit(0);
  }

  if (!commandOptions.confirm) {
    const result = await inquirer.prompt({
      type: "confirm",
      name: "confirm",
      message: `Do you confirm the above rewards for cycle #${cycle}?`,
      default: false,
    });
    if (!result.confirm) {
      console.log("Rewards not confirmed. Aborting...");
      process.exit(0);
    }
  }

  const successfulPayments: Array<BasePayment> = [...distributedPayments];
  const failedPayments: Array<BasePayment> = [];

  const nonEmptyBatches = batches.filter((batch) => !isEmpty(batch));
  if (getConfig("payout_wallet_mode") === EPayoutWalletMode.Ledger) {
    console.log(`NOTE: You have to confirm each batch on ledger.`);
  }
  for (let i = 0; i < nonEmptyBatches.length; i++) {
    try {
      const batch = nonEmptyBatches[i];
      if (isEmpty(batch)) continue;
      console.log(
        `Sending batch ${i + 1}/${nonEmptyBatches.length} containing ${
          nonEmptyBatches[i].length
        } transaction(s) ...`
      );
      const opBatch = await sendBatch(
        provider,
        batch.map(prepareTransactionForSubmission)
      );
      for (const payment of batch) {
        payment.hash = opBatch.opHash;
      }
      await opBatch.confirmation(2);
      console.log(
        `Transaction confirmed on ${getExplorerUrl(
          opBatch.opHash,
          getConfig("network_configuration").explorer_url_template
        )}`
      );
      successfulPayments.push(...batch);
    } catch (e: unknown) {
      console.error(e);
      const batch = nonEmptyBatches[i];
      for (const payment of batch) {
        (payment as DelegatorPayment).note = (e as Error).message;
      }
      failedPayments.push(...batch);
    }
  }
  await writeReportAndSendNotifications(
    cycle,
    { successfulPayments, failedPayments, excludedPayments },
    result
  );
};
