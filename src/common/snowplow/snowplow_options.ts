export type EnabledCallback = () => boolean;

export type SnowplowOptions = {
  appId: string;
  endpoint: string;
  timeInterval: number;
  maxItems: number;
  enabled: EnabledCallback;
};

export const snowplowBaseOptions: Omit<SnowplowOptions, 'enabled'> = {
  appId: 'gitlab_ide_extension',
  endpoint: 'https://snowplow.trx.gitlab.net',
  timeInterval: 5000,
  maxItems: 10,
};
