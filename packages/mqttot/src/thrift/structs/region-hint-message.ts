/* eslint-disable */
import thrift from "thrift";
import Int64 from "node-int64";

export interface IMqttotRegionHintPacketArgs {
  hint: string;
}
export class MqttotRegionHintPacket {
  public hint: string;
  constructor(args: IMqttotRegionHintPacketArgs) {
    if (args != null && args.hint != null) {
      this.hint = args.hint;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[hint] is unset!",
      );
    }
  }
  public write(output: thrift.TProtocol): void {
    output.writeStructBegin("MqttotRegionHintPacket");
    if (this.hint != null) {
      output.writeFieldBegin("hint", thrift.Thrift.Type.STRING, 1);
      output.writeString(this.hint);
      output.writeFieldEnd();
    }
    output.writeFieldStop();
    output.writeStructEnd();
    return;
  }
  public static read(input: thrift.TProtocol): MqttotRegionHintPacket {
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
            _args.hint = value_1;
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
    if (_args.hint !== undefined) {
      return new MqttotRegionHintPacket(_args);
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Unable to read MqttotRegionHintPacket from input",
      );
    }
  }
}
