import {
  ConnectResponsePacket,
  type ConnectReturnCode,
  type PacketStream,
} from "mqtts";

export class MqttotConnectResponsePacket extends ConnectResponsePacket {
  constructor(
    ackFlags: number,
    returnCode: ConnectReturnCode,
    public readonly payload: Buffer,
  ) {
    super(ackFlags, returnCode);
  }

  static fromStream(
    this: void,
    stream: PacketStream,
    remaining: number,
  ): MqttotConnectResponsePacket {
    const ack = stream.readByte();
    const returnCode = stream.readByte();
    if (ack > 1) {
      throw new Error("Invalid ack");
    } else if (returnCode > 5) {
      throw new Error("Invalid return code");
    }
    return new MqttotConnectResponsePacket(
      ack,
      returnCode,
      remaining > 2 ? stream.readStringAsBuffer() : Buffer.alloc(0),
    );
  }
}

export type MqttotConnectPacketOpts = {
  keepAlive: number;
  payload: Buffer;
};
export function writeMqttotConnectPacket(
  stream: PacketStream,
  opts: MqttotConnectPacketOpts,
) {
  stream.writeString("MQTToT");
  stream.writeByte(3);
  stream.writeByte(194);
  stream.writeWord(opts.keepAlive);
  stream.write(opts.payload);
  return {};
}
