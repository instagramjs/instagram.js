/* eslint-disable */
import thrift from "thrift";
import Int64 from "node-int64";

export interface IMqttotConnectionPacketArgs {
  clientIdentifier: string;
  clientInfo: MqttotClientInfo;
  password: string;
  getDiffsRequests?: Array<string>;
  zeroRatingTokenHash?: string;
  appSpecificInfo?: Map<string, string>;
}
export class MqttotConnectionPacket {
  public clientIdentifier: string;
  public clientInfo: MqttotClientInfo;
  public password: string;
  public getDiffsRequests?: Array<string>;
  public zeroRatingTokenHash?: string;
  public appSpecificInfo?: Map<string, string>;
  constructor(args: IMqttotConnectionPacketArgs) {
    if (args != null && args.clientIdentifier != null) {
      this.clientIdentifier = args.clientIdentifier;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[clientIdentifier] is unset!",
      );
    }
    if (args != null && args.clientInfo != null) {
      this.clientInfo = args.clientInfo;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[clientInfo] is unset!",
      );
    }
    if (args != null && args.password != null) {
      this.password = args.password;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[password] is unset!",
      );
    }
    if (args != null && args.getDiffsRequests != null) {
      this.getDiffsRequests = args.getDiffsRequests;
    }
    if (args != null && args.zeroRatingTokenHash != null) {
      this.zeroRatingTokenHash = args.zeroRatingTokenHash;
    }
    if (args != null && args.appSpecificInfo != null) {
      this.appSpecificInfo = args.appSpecificInfo;
    }
  }
  public write(output: thrift.TProtocol): void {
    output.writeStructBegin("MqttotConnectionPacket");
    if (this.clientIdentifier != null) {
      output.writeFieldBegin("clientIdentifier", thrift.Thrift.Type.STRING, 1);
      output.writeString(this.clientIdentifier);
      output.writeFieldEnd();
    }
    if (this.clientInfo != null) {
      output.writeFieldBegin("clientInfo", thrift.Thrift.Type.STRUCT, 4);
      this.clientInfo.write(output);
      output.writeFieldEnd();
    }
    if (this.password != null) {
      output.writeFieldBegin("password", thrift.Thrift.Type.STRING, 5);
      output.writeString(this.password);
      output.writeFieldEnd();
    }
    if (this.getDiffsRequests != null) {
      output.writeFieldBegin("getDiffsRequests", thrift.Thrift.Type.LIST, 6);
      output.writeListBegin(
        thrift.Thrift.Type.STRING,
        this.getDiffsRequests.length,
      );
      this.getDiffsRequests.forEach((value_1: string): void => {
        output.writeString(value_1);
      });
      output.writeListEnd();
      output.writeFieldEnd();
    }
    if (this.zeroRatingTokenHash != null) {
      output.writeFieldBegin(
        "zeroRatingTokenHash",
        thrift.Thrift.Type.STRING,
        9,
      );
      output.writeString(this.zeroRatingTokenHash);
      output.writeFieldEnd();
    }
    if (this.appSpecificInfo != null) {
      output.writeFieldBegin("appSpecificInfo", thrift.Thrift.Type.MAP, 10);
      output.writeMapBegin(
        thrift.Thrift.Type.STRING,
        thrift.Thrift.Type.STRING,
        this.appSpecificInfo.size,
      );
      this.appSpecificInfo.forEach((value_2: string, key_1: string): void => {
        output.writeString(key_1);
        output.writeString(value_2);
      });
      output.writeMapEnd();
      output.writeFieldEnd();
    }
    output.writeFieldStop();
    output.writeStructEnd();
    return;
  }
  public static read(input: thrift.TProtocol): MqttotConnectionPacket {
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
            const value_3: string = input.readString();
            _args.clientIdentifier = value_3;
          } else {
            input.skip(fieldType);
          }
          break;
        case 4:
          if (fieldType === thrift.Thrift.Type.STRUCT) {
            const value_4: MqttotClientInfo = MqttotClientInfo.read(input);
            _args.clientInfo = value_4;
          } else {
            input.skip(fieldType);
          }
          break;
        case 5:
          if (fieldType === thrift.Thrift.Type.STRING) {
            const value_5: string = input.readString();
            _args.password = value_5;
          } else {
            input.skip(fieldType);
          }
          break;
        case 6:
          if (fieldType === thrift.Thrift.Type.LIST) {
            const value_6: Array<string> = new Array<string>();
            const metadata_1: thrift.TList = input.readListBegin();
            const size_1: number = metadata_1.size;
            for (let i_1: number = 0; i_1 < size_1; i_1++) {
              const value_7: string = input.readString();
              value_6.push(value_7);
            }
            input.readListEnd();
            _args.getDiffsRequests = value_6;
          } else {
            input.skip(fieldType);
          }
          break;
        case 9:
          if (fieldType === thrift.Thrift.Type.STRING) {
            const value_8: string = input.readString();
            _args.zeroRatingTokenHash = value_8;
          } else {
            input.skip(fieldType);
          }
          break;
        case 10:
          if (fieldType === thrift.Thrift.Type.MAP) {
            const value_9: Map<string, string> = new Map<string, string>();
            const metadata_2: thrift.TMap = input.readMapBegin();
            const size_2: number = metadata_2.size;
            for (let i_2: number = 0; i_2 < size_2; i_2++) {
              const key_2: string = input.readString();
              const value_10: string = input.readString();
              value_9.set(key_2, value_10);
            }
            input.readMapEnd();
            _args.appSpecificInfo = value_9;
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
    if (
      _args.clientIdentifier !== undefined &&
      _args.clientInfo !== undefined &&
      _args.password !== undefined
    ) {
      return new MqttotConnectionPacket(_args);
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Unable to read MqttotConnectionPacket from input",
      );
    }
  }
}
export interface IMqttotClientInfoArgs {
  userId: number | Int64;
  userAgent: string;
  clientCapabilities: number | Int64;
  endpointCapabilities: number | Int64;
  publishFormat: number;
  noAutomaticForeground: boolean;
  makeUserAvailableInForeground: boolean;
  deviceId: string;
  isInitiallyForeground: boolean;
  networkType: number;
  networkSubtype: number;
  clientMqttSessionId: number | Int64;
  subscribeTopics: Array<number>;
  clientType: string;
  appId: number | Int64;
  clientStack: number;
}
export class MqttotClientInfo {
  public userId: Int64;
  public userAgent: string;
  public clientCapabilities: Int64;
  public endpointCapabilities: Int64;
  public publishFormat: number;
  public noAutomaticForeground: boolean;
  public makeUserAvailableInForeground: boolean;
  public deviceId: string;
  public isInitiallyForeground: boolean;
  public networkType: number;
  public networkSubtype: number;
  public clientMqttSessionId: Int64;
  public subscribeTopics: Array<number>;
  public clientType: string;
  public appId: Int64;
  public clientStack: number;
  constructor(args: IMqttotClientInfoArgs) {
    if (args != null && args.userId != null) {
      if (typeof args.userId === "number") {
        this.userId = new Int64(args.userId);
      } else {
        this.userId = args.userId;
      }
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[userId] is unset!",
      );
    }
    if (args != null && args.userAgent != null) {
      this.userAgent = args.userAgent;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[userAgent] is unset!",
      );
    }
    if (args != null && args.clientCapabilities != null) {
      if (typeof args.clientCapabilities === "number") {
        this.clientCapabilities = new Int64(args.clientCapabilities);
      } else {
        this.clientCapabilities = args.clientCapabilities;
      }
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[clientCapabilities] is unset!",
      );
    }
    if (args != null && args.endpointCapabilities != null) {
      if (typeof args.endpointCapabilities === "number") {
        this.endpointCapabilities = new Int64(args.endpointCapabilities);
      } else {
        this.endpointCapabilities = args.endpointCapabilities;
      }
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[endpointCapabilities] is unset!",
      );
    }
    if (args != null && args.publishFormat != null) {
      this.publishFormat = args.publishFormat;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[publishFormat] is unset!",
      );
    }
    if (args != null && args.noAutomaticForeground != null) {
      this.noAutomaticForeground = args.noAutomaticForeground;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[noAutomaticForeground] is unset!",
      );
    }
    if (args != null && args.makeUserAvailableInForeground != null) {
      this.makeUserAvailableInForeground = args.makeUserAvailableInForeground;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[makeUserAvailableInForeground] is unset!",
      );
    }
    if (args != null && args.deviceId != null) {
      this.deviceId = args.deviceId;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[deviceId] is unset!",
      );
    }
    if (args != null && args.isInitiallyForeground != null) {
      this.isInitiallyForeground = args.isInitiallyForeground;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[isInitiallyForeground] is unset!",
      );
    }
    if (args != null && args.networkType != null) {
      this.networkType = args.networkType;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[networkType] is unset!",
      );
    }
    if (args != null && args.networkSubtype != null) {
      this.networkSubtype = args.networkSubtype;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[networkSubtype] is unset!",
      );
    }
    if (args != null && args.clientMqttSessionId != null) {
      if (typeof args.clientMqttSessionId === "number") {
        this.clientMqttSessionId = new Int64(args.clientMqttSessionId);
      } else {
        this.clientMqttSessionId = args.clientMqttSessionId;
      }
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[clientMqttSessionId] is unset!",
      );
    }
    if (args != null && args.subscribeTopics != null) {
      this.subscribeTopics = args.subscribeTopics;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[subscribeTopics] is unset!",
      );
    }
    if (args != null && args.clientType != null) {
      this.clientType = args.clientType;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[clientType] is unset!",
      );
    }
    if (args != null && args.appId != null) {
      if (typeof args.appId === "number") {
        this.appId = new Int64(args.appId);
      } else {
        this.appId = args.appId;
      }
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[appId] is unset!",
      );
    }
    if (args != null && args.clientStack != null) {
      this.clientStack = args.clientStack;
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Required field[clientStack] is unset!",
      );
    }
  }
  public write(output: thrift.TProtocol): void {
    output.writeStructBegin("MqttotClientInfo");
    if (this.userId != null) {
      output.writeFieldBegin("userId", thrift.Thrift.Type.I64, 1);
      output.writeI64(this.userId);
      output.writeFieldEnd();
    }
    if (this.userAgent != null) {
      output.writeFieldBegin("userAgent", thrift.Thrift.Type.STRING, 2);
      output.writeString(this.userAgent);
      output.writeFieldEnd();
    }
    if (this.clientCapabilities != null) {
      output.writeFieldBegin("clientCapabilities", thrift.Thrift.Type.I64, 3);
      output.writeI64(this.clientCapabilities);
      output.writeFieldEnd();
    }
    if (this.endpointCapabilities != null) {
      output.writeFieldBegin("endpointCapabilities", thrift.Thrift.Type.I64, 4);
      output.writeI64(this.endpointCapabilities);
      output.writeFieldEnd();
    }
    if (this.publishFormat != null) {
      output.writeFieldBegin("publishFormat", thrift.Thrift.Type.I32, 5);
      output.writeI32(this.publishFormat);
      output.writeFieldEnd();
    }
    if (this.noAutomaticForeground != null) {
      output.writeFieldBegin(
        "noAutomaticForeground",
        thrift.Thrift.Type.BOOL,
        6,
      );
      output.writeBool(this.noAutomaticForeground);
      output.writeFieldEnd();
    }
    if (this.makeUserAvailableInForeground != null) {
      output.writeFieldBegin(
        "makeUserAvailableInForeground",
        thrift.Thrift.Type.BOOL,
        7,
      );
      output.writeBool(this.makeUserAvailableInForeground);
      output.writeFieldEnd();
    }
    if (this.deviceId != null) {
      output.writeFieldBegin("deviceId", thrift.Thrift.Type.STRING, 8);
      output.writeString(this.deviceId);
      output.writeFieldEnd();
    }
    if (this.isInitiallyForeground != null) {
      output.writeFieldBegin(
        "isInitiallyForeground",
        thrift.Thrift.Type.BOOL,
        9,
      );
      output.writeBool(this.isInitiallyForeground);
      output.writeFieldEnd();
    }
    if (this.networkType != null) {
      output.writeFieldBegin("networkType", thrift.Thrift.Type.I32, 10);
      output.writeI32(this.networkType);
      output.writeFieldEnd();
    }
    if (this.networkSubtype != null) {
      output.writeFieldBegin("networkSubtype", thrift.Thrift.Type.I32, 11);
      output.writeI32(this.networkSubtype);
      output.writeFieldEnd();
    }
    if (this.clientMqttSessionId != null) {
      output.writeFieldBegin("clientMqttSessionId", thrift.Thrift.Type.I64, 12);
      output.writeI64(this.clientMqttSessionId);
      output.writeFieldEnd();
    }
    if (this.subscribeTopics != null) {
      output.writeFieldBegin("subscribeTopics", thrift.Thrift.Type.LIST, 14);
      output.writeListBegin(
        thrift.Thrift.Type.I32,
        this.subscribeTopics.length,
      );
      this.subscribeTopics.forEach((value_11: number): void => {
        output.writeI32(value_11);
      });
      output.writeListEnd();
      output.writeFieldEnd();
    }
    if (this.clientType != null) {
      output.writeFieldBegin("clientType", thrift.Thrift.Type.STRING, 15);
      output.writeString(this.clientType);
      output.writeFieldEnd();
    }
    if (this.appId != null) {
      output.writeFieldBegin("appId", thrift.Thrift.Type.I64, 16);
      output.writeI64(this.appId);
      output.writeFieldEnd();
    }
    if (this.clientStack != null) {
      output.writeFieldBegin("clientStack", thrift.Thrift.Type.BYTE, 21);
      output.writeByte(this.clientStack);
      output.writeFieldEnd();
    }
    output.writeFieldStop();
    output.writeStructEnd();
    return;
  }
  public static read(input: thrift.TProtocol): MqttotClientInfo {
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
          if (fieldType === thrift.Thrift.Type.I64) {
            const value_12: Int64 = input.readI64();
            _args.userId = value_12;
          } else {
            input.skip(fieldType);
          }
          break;
        case 2:
          if (fieldType === thrift.Thrift.Type.STRING) {
            const value_13: string = input.readString();
            _args.userAgent = value_13;
          } else {
            input.skip(fieldType);
          }
          break;
        case 3:
          if (fieldType === thrift.Thrift.Type.I64) {
            const value_14: Int64 = input.readI64();
            _args.clientCapabilities = value_14;
          } else {
            input.skip(fieldType);
          }
          break;
        case 4:
          if (fieldType === thrift.Thrift.Type.I64) {
            const value_15: Int64 = input.readI64();
            _args.endpointCapabilities = value_15;
          } else {
            input.skip(fieldType);
          }
          break;
        case 5:
          if (fieldType === thrift.Thrift.Type.I32) {
            const value_16: number = input.readI32();
            _args.publishFormat = value_16;
          } else {
            input.skip(fieldType);
          }
          break;
        case 6:
          if (fieldType === thrift.Thrift.Type.BOOL) {
            const value_17: boolean = input.readBool();
            _args.noAutomaticForeground = value_17;
          } else {
            input.skip(fieldType);
          }
          break;
        case 7:
          if (fieldType === thrift.Thrift.Type.BOOL) {
            const value_18: boolean = input.readBool();
            _args.makeUserAvailableInForeground = value_18;
          } else {
            input.skip(fieldType);
          }
          break;
        case 8:
          if (fieldType === thrift.Thrift.Type.STRING) {
            const value_19: string = input.readString();
            _args.deviceId = value_19;
          } else {
            input.skip(fieldType);
          }
          break;
        case 9:
          if (fieldType === thrift.Thrift.Type.BOOL) {
            const value_20: boolean = input.readBool();
            _args.isInitiallyForeground = value_20;
          } else {
            input.skip(fieldType);
          }
          break;
        case 10:
          if (fieldType === thrift.Thrift.Type.I32) {
            const value_21: number = input.readI32();
            _args.networkType = value_21;
          } else {
            input.skip(fieldType);
          }
          break;
        case 11:
          if (fieldType === thrift.Thrift.Type.I32) {
            const value_22: number = input.readI32();
            _args.networkSubtype = value_22;
          } else {
            input.skip(fieldType);
          }
          break;
        case 12:
          if (fieldType === thrift.Thrift.Type.I64) {
            const value_23: Int64 = input.readI64();
            _args.clientMqttSessionId = value_23;
          } else {
            input.skip(fieldType);
          }
          break;
        case 14:
          if (fieldType === thrift.Thrift.Type.LIST) {
            const value_24: Array<number> = new Array<number>();
            const metadata_3: thrift.TList = input.readListBegin();
            const size_3: number = metadata_3.size;
            for (let i_3: number = 0; i_3 < size_3; i_3++) {
              const value_25: number = input.readI32();
              value_24.push(value_25);
            }
            input.readListEnd();
            _args.subscribeTopics = value_24;
          } else {
            input.skip(fieldType);
          }
          break;
        case 15:
          if (fieldType === thrift.Thrift.Type.STRING) {
            const value_26: string = input.readString();
            _args.clientType = value_26;
          } else {
            input.skip(fieldType);
          }
          break;
        case 16:
          if (fieldType === thrift.Thrift.Type.I64) {
            const value_27: Int64 = input.readI64();
            _args.appId = value_27;
          } else {
            input.skip(fieldType);
          }
          break;
        case 21:
          if (fieldType === thrift.Thrift.Type.BYTE) {
            const value_28: number = input.readByte();
            _args.clientStack = value_28;
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
    if (
      _args.userId !== undefined &&
      _args.userAgent !== undefined &&
      _args.clientCapabilities !== undefined &&
      _args.endpointCapabilities !== undefined &&
      _args.publishFormat !== undefined &&
      _args.noAutomaticForeground !== undefined &&
      _args.makeUserAvailableInForeground !== undefined &&
      _args.deviceId !== undefined &&
      _args.isInitiallyForeground !== undefined &&
      _args.networkType !== undefined &&
      _args.networkSubtype !== undefined &&
      _args.clientMqttSessionId !== undefined &&
      _args.subscribeTopics !== undefined &&
      _args.clientType !== undefined &&
      _args.appId !== undefined &&
      _args.clientStack !== undefined
    ) {
      return new MqttotClientInfo(_args);
    } else {
      throw new thrift.Thrift.TProtocolException(
        thrift.Thrift.TProtocolExceptionType.UNKNOWN,
        "Unable to read MqttotClientInfo from input",
      );
    }
  }
}
