/* eslint-disable */
import thrift from "thrift";
import Int64 from "node-int64";

export interface IMqttotSkywalkerMessagePacketArgs {
  topic: string;
  payload: string;
}
export class MqttotSkywalkerMessagePacket {
  public topic: string;
  public payload: string;
  constructor(args: IMqttotSkywalkerMessagePacketArgs) {
    if (args != null && args.topic != null) {
      this.topic = args.topic;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[topic] is unset!",
      );
    }
    if (args != null && args.payload != null) {
      this.payload = args.payload;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[payload] is unset!",
      );
    }
  }
  public write(output: thrift.TProtocol): void {
    output.writeStructBegin("MqttotSkywalkerMessagePacket");
    if (this.topic != null) {
      output.writeFieldBegin("topic", thrift.Thrift.Type.STRING, 1);
      output.writeString(this.topic);
      output.writeFieldEnd();
    }
    if (this.payload != null) {
      output.writeFieldBegin("payload", thrift.Thrift.Type.STRING, 2);
      output.writeString(this.payload);
      output.writeFieldEnd();
    }
    output.writeFieldStop();
    output.writeStructEnd();
    return;
  }
  public static read(input: thrift.TProtocol): MqttotSkywalkerMessagePacket {
    input.readStructBegin();
    let _args: any = {};
    while (true) {
      const ret: thrift.TField = input.readFieldBegin();
      const fieldType: thrift.Thrift.Type = ret.ftype;
      const fieldId: number = ret.fid;
      if (fieldType === thrift.Thrift.Type.STOP) {
        break;
      }
      switch (fieldId) {
        case 1:
          if (fieldType === thrift.Thrift.Type.STRING) {
            const value_1: string = input.readString();
            _args.topic = value_1;
          } else {
            input.skip(fieldType);
          }
          break;
        case 2:
          if (fieldType === thrift.Thrift.Type.STRING) {
            const value_2: string = input.readString();
            _args.payload = value_2;
          } else {
            input.skip(fieldType);
          }
          break;
        default: {
          input.skip(fieldType);
        }
      }
      input.readFieldEnd();
    }
    input.readStructEnd();
    if (_args.topic !== undefined && _args.payload !== undefined) {
      return new MqttotSkywalkerMessagePacket(_args);
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Unable to read MqttotSkywalkerMessagePacket from input",
      );
    }
  }
}
