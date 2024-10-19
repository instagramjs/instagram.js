struct MqttotConnectionPacket {
  1: required string clientIdentifier,
  4: required MqttotClientInfo clientInfo,
  5: required string password,
  6: optional list<string> getDiffsRequests,
  9: optional string zeroRatingTokenHash,
  10: optional map<string, string> appSpecificInfo,
}

struct MqttotClientInfo {
  1: required i64 userId,
  2: required string userAgent,
  3: required i64 clientCapabilities,
  4: required i64 endpointCapabilities,
  5: required i32 publishFormat,
  6: required bool noAutomaticForeground,
  7: required bool makeUserAvailableInForeground,
  8: required string deviceId,
  9: required bool isInitiallyForeground,
  10: required i32 networkType,
  11: required i32 networkSubtype,
  12: required i64 clientMqttSessionId,
  14: required list<i32> subscribeTopics,
  15: required string clientType,
  16: required i64 appId,
  21: required byte clientStack,
}
