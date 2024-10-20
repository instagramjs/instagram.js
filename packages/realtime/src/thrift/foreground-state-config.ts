/* eslint-disable */
import thrift from "thrift";
import Int64 from "node-int64";

export interface IMqttotForegroundStateConfigPacketArgs {
  inForegroundApp?: boolean;
  inForegroundDevice?: boolean;
  keepAliveTimeout?: number;
  subscribeTopics?: Array<string>;
  subscribeGenericTopics?: Array<string>;
  unsubscribeTopics?: Array<string>;
  unsubscribeGenericTopics?: Array<string>;
  requestId?: number | Int64;
}
export class MqttotForegroundStateConfigPacket {
  public inForegroundApp?: boolean;
  public inForegroundDevice?: boolean;
  public keepAliveTimeout?: number;
  public subscribeTopics?: Array<string>;
  public subscribeGenericTopics?: Array<string>;
  public unsubscribeTopics?: Array<string>;
  public unsubscribeGenericTopics?: Array<string>;
  public requestId?: Int64;
  constructor(args?: IMqttotForegroundStateConfigPacketArgs) {
    if (args != null && args.inForegroundApp != null) {
      this.inForegroundApp = args.inForegroundApp;
    }
    if (args != null && args.inForegroundDevice != null) {
      this.inForegroundDevice = args.inForegroundDevice;
    }
    if (args != null && args.keepAliveTimeout != null) {
      this.keepAliveTimeout = args.keepAliveTimeout;
    }
    if (args != null && args.subscribeTopics != null) {
      this.subscribeTopics = args.subscribeTopics;
    }
    if (args != null && args.subscribeGenericTopics != null) {
      this.subscribeGenericTopics = args.subscribeGenericTopics;
    }
    if (args != null && args.unsubscribeTopics != null) {
      this.unsubscribeTopics = args.unsubscribeTopics;
    }
    if (args != null && args.unsubscribeGenericTopics != null) {
      this.unsubscribeGenericTopics = args.unsubscribeGenericTopics;
    }
    if (args != null && args.requestId != null) {
      if (typeof args.requestId === "number") {
        this.requestId = new Int64(args.requestId);
      } else {
        this.requestId = args.requestId;
      }
    }
  }
  public write(output: thrift.TProtocol): void {
    output.writeStructBegin("MqttotForegroundStateConfigPacket");
    if (this.inForegroundApp != null) {
      output.writeFieldBegin("inForegroundApp", thrift.Thrift.Type.BOOL, 1);
      output.writeBool(this.inForegroundApp);
      output.writeFieldEnd();
    }
    if (this.inForegroundDevice != null) {
      output.writeFieldBegin("inForegroundDevice", thrift.Thrift.Type.BOOL, 2);
      output.writeBool(this.inForegroundDevice);
      output.writeFieldEnd();
    }
    if (this.keepAliveTimeout != null) {
      output.writeFieldBegin("keepAliveTimeout", thrift.Thrift.Type.I32, 3);
      output.writeI32(this.keepAliveTimeout);
      output.writeFieldEnd();
    }
    if (this.subscribeTopics != null) {
      output.writeFieldBegin("subscribeTopics", thrift.Thrift.Type.LIST, 4);
      output.writeListBegin(
        thrift.Thrift.Type.STRING,
        this.subscribeTopics.length,
      );
      this.subscribeTopics.forEach((value_1: string): void => {
        output.writeString(value_1);
      });
      output.writeListEnd();
      output.writeFieldEnd();
    }
    if (this.subscribeGenericTopics != null) {
      output.writeFieldBegin(
        "subscribeGenericTopics",
        thrift.Thrift.Type.LIST,
        5,
      );
      output.writeListBegin(
        thrift.Thrift.Type.STRING,
        this.subscribeGenericTopics.length,
      );
      this.subscribeGenericTopics.forEach((value_2: string): void => {
        output.writeString(value_2);
      });
      output.writeListEnd();
      output.writeFieldEnd();
    }
    if (this.unsubscribeTopics != null) {
      output.writeFieldBegin("unsubscribeTopics", thrift.Thrift.Type.LIST, 6);
      output.writeListBegin(
        thrift.Thrift.Type.STRING,
        this.unsubscribeTopics.length,
      );
      this.unsubscribeTopics.forEach((value_3: string): void => {
        output.writeString(value_3);
      });
      output.writeListEnd();
      output.writeFieldEnd();
    }
    if (this.unsubscribeGenericTopics != null) {
      output.writeFieldBegin(
        "unsubscribeGenericTopics",
        thrift.Thrift.Type.LIST,
        7,
      );
      output.writeListBegin(
        thrift.Thrift.Type.STRING,
        this.unsubscribeGenericTopics.length,
      );
      this.unsubscribeGenericTopics.forEach((value_4: string): void => {
        output.writeString(value_4);
      });
      output.writeListEnd();
      output.writeFieldEnd();
    }
    if (this.requestId != null) {
      output.writeFieldBegin("requestId", thrift.Thrift.Type.I64, 8);
      output.writeI64(this.requestId);
      output.writeFieldEnd();
    }
    output.writeFieldStop();
    output.writeStructEnd();
    return;
  }
  public static read(
    input: thrift.TProtocol,
  ): MqttotForegroundStateConfigPacket {
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
          if (fieldType === thrift.Thrift.Type.BOOL) {
            const value_5: boolean = input.readBool();
            _args.inForegroundApp = value_5;
          } else {
            input.skip(fieldType);
          }
          break;
        case 2:
          if (fieldType === thrift.Thrift.Type.BOOL) {
            const value_6: boolean = input.readBool();
            _args.inForegroundDevice = value_6;
          } else {
            input.skip(fieldType);
          }
          break;
        case 3:
          if (fieldType === thrift.Thrift.Type.I32) {
            const value_7: number = input.readI32();
            _args.keepAliveTimeout = value_7;
          } else {
            input.skip(fieldType);
          }
          break;
        case 4:
          if (fieldType === thrift.Thrift.Type.LIST) {
            const value_8: Array<string> = new Array<string>();
            const metadata_1: thrift.TList = input.readListBegin();
            const size_1: number = metadata_1.size;
            for (let i_1: number = 0; i_1 < size_1; i_1++) {
              const value_9: string = input.readString();
              value_8.push(value_9);
            }
            input.readListEnd();
            _args.subscribeTopics = value_8;
          } else {
            input.skip(fieldType);
          }
          break;
        case 5:
          if (fieldType === thrift.Thrift.Type.LIST) {
            const value_10: Array<string> = new Array<string>();
            const metadata_2: thrift.TList = input.readListBegin();
            const size_2: number = metadata_2.size;
            for (let i_2: number = 0; i_2 < size_2; i_2++) {
              const value_11: string = input.readString();
              value_10.push(value_11);
            }
            input.readListEnd();
            _args.subscribeGenericTopics = value_10;
          } else {
            input.skip(fieldType);
          }
          break;
        case 6:
          if (fieldType === thrift.Thrift.Type.LIST) {
            const value_12: Array<string> = new Array<string>();
            const metadata_3: thrift.TList = input.readListBegin();
            const size_3: number = metadata_3.size;
            for (let i_3: number = 0; i_3 < size_3; i_3++) {
              const value_13: string = input.readString();
              value_12.push(value_13);
            }
            input.readListEnd();
            _args.unsubscribeTopics = value_12;
          } else {
            input.skip(fieldType);
          }
          break;
        case 7:
          if (fieldType === thrift.Thrift.Type.LIST) {
            const value_14: Array<string> = new Array<string>();
            const metadata_4: thrift.TList = input.readListBegin();
            const size_4: number = metadata_4.size;
            for (let i_4: number = 0; i_4 < size_4; i_4++) {
              const value_15: string = input.readString();
              value_14.push(value_15);
            }
            input.readListEnd();
            _args.unsubscribeGenericTopics = value_14;
          } else {
            input.skip(fieldType);
          }
          break;
        case 8:
          if (fieldType === thrift.Thrift.Type.I64) {
            const value_16: Int64 = input.readI64();
            _args.requestId = value_16;
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
    return new MqttotForegroundStateConfigPacket(_args);
  }
}
