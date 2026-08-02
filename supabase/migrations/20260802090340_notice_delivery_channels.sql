alter table notices
  add column if not exists notification_channels notification_channel[]
  not null
  default array['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP']::notification_channel[];

alter table notices
  drop constraint if exists notices_notification_channels_count_chk;

alter table notices
  add constraint notices_notification_channels_count_chk
  check (cardinality(notification_channels) between 1 and 4);
