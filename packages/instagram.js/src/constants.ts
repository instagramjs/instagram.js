import type { MessageType } from './types';

export const APP_ID = '936619743392459';

export const BASE_URL = 'https://www.instagram.com';
export const GRAPHQL_ENDPOINT = 'https://www.instagram.com/api/graphql';
export const INBOX_URL = 'https://www.instagram.com/direct/inbox/';
export const MQTT_ENDPOINT = 'wss://edge-chat.instagram.com/chat';

export const MQTT_CLIENT_ID = 'mqttwsclient';
export const DEFAULT_MQTT_KEEPALIVE = 10;
export const TYPING_TTL = 22_000;

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const X_ASBD_ID = '129477';

export const DEFAULT_DOC_IDS: Record<string, string> = {
  IGDInboxTrayQuery: '26487037210884987',
  PolarisDirectInboxQuery: '26319524444339386',
  IGDInboxHeaderOffMsysQuery: '26010406211946385',
  IGDInboxInfoOffMsysQuery: '25293525316996902',
  IGDThreadDetailMainViewContainerQuery: '24526102787088272',
  IGDMessageListOffMsysQuery: '25886871530975437',
  IGDThreadListOffMsysPaginationQuery: '26580659284892408',
  IGDBadgeCountOffMsysQuery: '33328371206806736',
  IGDSlideAsyncFetchAndInsertIGDViewerThreadQuery: '26005978085735243',
  IGDInboxSearchNullStateQuery: '25775167035455197',
  useIGDSystemFolderUnreadThreadCountQuery: '24756039620738912',
  ZenonMWThriftSendMessageMutation: '9720271894689175',
  IGDirectTextSendMutation: '25288447354146606',
  IGDirectMediaSendMutation: '25604816565789936',
  IGDirectAnimatedMediaSendMutation: '32089613413987432',
  IGDirectReactionSendMutation: '24374451552236906',
  IGDirectEditMessageMutation: '32480262318254796',
  IGDirectGenericXMAShareMutation: '25056930583969517',
  useIGDMarkThreadAsReadMutation: '32563776493268694',
  useIGDMarkThreadAsReadValidationMutation: '26181147371514727',
  IGDMessageUnsendDialogOffMsysMutation: '24812777031749983',
  IGDEditThreadNameDialogOffMsysMutation: '25675244872132052',
  IGDInboxInfoDeleteThreadDialogOffMsysMutation: '24668055719545670',
  IGDInboxInfoMuteToggleOffMsysMutation: '26194013106871367',
  useIGDEditNicknameMutation: '25729722500051691',
  IGDNicknameSettingsPageMutation: '25822446054086836',
  LSPlatformGraphQLLightspeedRequestForIGDQuery: '9859601450795492',
  IGDMqttIrisSubscriptionQuery: '9476575619127164',
};

export const ITEM_TYPE_MAP: Record<string, MessageType> = {
  text: 'text',
  media: 'media',
  like: 'like',
  link: 'link',
  media_share: 'mediaShare',
  reel_share: 'reelShare',
  story_share: 'storyShare',
  voice_media: 'voiceMedia',
  animated_media: 'animatedMedia',
  raven_media: 'ravenMedia',
  clip: 'clip',
  clip_share: 'clip',
  action_log: 'actionLog',
  placeholder: 'placeholder',
};

export const DEFAULT_CLIENT_OPTIONS: {
  reconnect: boolean;
  reconnectInterval: number;
  reconnectMaxRetries: number;
  syncOnConnect: boolean;
  maxCachedThreads: number;
  maxCachedMessages: number;
  mqttKeepAlive: number;
} = {
  reconnect: true,
  reconnectInterval: 5000,
  reconnectMaxRetries: 10,
  syncOnConnect: true,
  maxCachedThreads: 50,
  maxCachedMessages: 100,
  mqttKeepAlive: DEFAULT_MQTT_KEEPALIVE,
};
