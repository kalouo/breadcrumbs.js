export type NotificationPluginConfiguration = {
  type: string;
  messageTemplate?: string;
};

export type PluginHostDetails = {
  id: string;
  version: string;
};

export enum ENotificationLevel {
  Error,
  Warning,
  Info,
}

export enum ENotificationPluginKind {
  Discord = "discord",
  Telegram = "telegram",
  Twitter = "twitter",
  Native = "native",
}

export interface NotificationPlugin {
  notify(data: NotificationInputData, level?: ENotificationLevel);
}

export interface NotificationInputData {
  cycle: string;
  cycleStakingBalance: string;
  totalDistributed: string;
  numberOfDelegators: string;
}
