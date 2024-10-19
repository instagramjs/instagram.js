struct MqttotForegroundStateConfigPacket {
  1: bool inForegroundApp,
  2: bool inForegroundDevice,
  3: i32 keepAliveTimeout,
  4: list<string> subscribeTopics,
  5: list<string> subscribeGenericTopics,
  6: list<string> unsubscribeTopics,
  7: list<string> unsubscribeGenericTopics,
  8: i64 requestId,
}
