import {
  type ConnectRequestOptions,
  DefaultPacketReadMap,
  type DefaultPacketReadResultMap,
  DefaultPacketWriteMap,
  type DefaultPacketWriteOptions,
  isConnAck,
  MqttClient,
  type PacketFlowFunc,
  PacketType,
  TlsTransport,
} from "mqtts";

import {
  type MqttotConnectPacketOpts,
  MqttotConnectResponsePacket,
  writeMqttotConnectPacket,
} from "./packets";

type MqttotClientReadMap = Omit<
  DefaultPacketReadResultMap,
  PacketType.ConnAck
> & {
  [PacketType.ConnAck]: MqttotConnectResponsePacket;
};
type MqttotClientWriteMap = Omit<
  DefaultPacketWriteOptions,
  PacketType.Connect
> & {
  [PacketType.Connect]: MqttotConnectPacketOpts;
};

export type MqttotClientOpts = {
  url: string;
  connectPayloadProvider: () => Promise<Buffer> | Buffer;
  connectPayloadRequired?: boolean;
  autoReconnect?: boolean;
};

export class MqttotClient extends MqttClient<
  MqttotClientReadMap,
  MqttotClientWriteMap
> {
  #connectPayload?: Buffer;

  constructor(public opts: MqttotClientOpts) {
    super({
      autoReconnect: opts.autoReconnect,
      readMap: {
        ...DefaultPacketReadMap,
        [PacketType.ConnAck]: MqttotConnectResponsePacket.fromStream,
      },
      writeMap: {
        ...DefaultPacketWriteMap,
        [PacketType.Connect]: writeMqttotConnectPacket,
      },
      transport: new TlsTransport({
        host: opts.url,
        port: 443,
      }),
    });
  }

  async connect(opts?: ConnectRequestOptions) {
    this.#connectPayload = await this.opts.connectPayloadProvider();
    return super.connect(opts);
  }

  getConnectFlow(): PacketFlowFunc<
    MqttotClientReadMap,
    MqttotClientWriteMap,
    unknown
  > {
    const payload = this.#connectPayload;
    if (!payload) {
      throw new Error("Missing connect payload");
    }
    return (success, error) => ({
      start: () => ({
        type: PacketType.Connect,
        options: {
          payload,
          keepAlive: 60,
        },
      }),
      accept: isConnAck,
      next: (packet: MqttotConnectResponsePacket) => {
        if (packet.isSuccess) {
          if (packet.payload?.length || !this.opts.connectPayloadRequired) {
            success(packet);
          } else {
            error(
              new Error("CONNACK error: Payload is missing but was expected"),
            );
          }
        } else {
          error(
            new Error(
              `CONNACK error: ${packet.errorName} (return code: ${packet.returnCode})`,
            ),
          );
        }
      },
    });
  }
}
