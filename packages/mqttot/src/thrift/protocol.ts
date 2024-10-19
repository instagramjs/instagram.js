import thrift from "thrift";

import { bigintToInt64, int64ToBigint } from "~/util";

export enum MqttotFieldType {
  STOP = 0x00,
  BOOLEAN = 0x02,
  BYTE = 0x03,
  INT_16 = 0x04,
  INT_32 = 0x05,
  INT_64 = 0x06,
  DOUBLE = 0x07,
  STRING = 0x08,
  LIST = 0x09,
  SET = 0x0a,
  MAP = 0x0b,
  STRUCT = 0x0c,
  UNSUPPORTED = 0xff,
}

const MQTTOT_TYPE_MAP: Partial<Record<thrift.Thrift.Type, MqttotFieldType>> = {
  [thrift.Thrift.Type.STOP]: MqttotFieldType.STOP,
  [thrift.Thrift.Type.BOOL]: MqttotFieldType.BOOLEAN,
  [thrift.Thrift.Type.BYTE]: MqttotFieldType.BYTE,
  [thrift.Thrift.Type.I16]: MqttotFieldType.INT_16,
  [thrift.Thrift.Type.I32]: MqttotFieldType.INT_32,
  [thrift.Thrift.Type.I64]: MqttotFieldType.INT_64,
  [thrift.Thrift.Type.DOUBLE]: MqttotFieldType.DOUBLE,
  [thrift.Thrift.Type.STRING]: MqttotFieldType.STRING,
  [thrift.Thrift.Type.STRUCT]: MqttotFieldType.STRUCT,
  [thrift.Thrift.Type.LIST]: MqttotFieldType.LIST,
  [thrift.Thrift.Type.SET]: MqttotFieldType.SET,
  [thrift.Thrift.Type.MAP]: MqttotFieldType.MAP,
};

function unsafeThriftTypeToMqttotType(
  type: thrift.Thrift.Type,
): MqttotFieldType {
  if (type in MQTTOT_TYPE_MAP) {
    return MQTTOT_TYPE_MAP[type]!;
  }
  throw new Error(`Unsupported Thrift type: ${type}`);
}

const THRIFT_TYPE_MAP: Partial<Record<MqttotFieldType, thrift.Thrift.Type>> = {
  [MqttotFieldType.STOP]: thrift.Thrift.Type.STOP,
  [MqttotFieldType.BOOLEAN]: thrift.Thrift.Type.BOOL,
  [MqttotFieldType.BYTE]: thrift.Thrift.Type.BYTE,
  [MqttotFieldType.INT_16]: thrift.Thrift.Type.I16,
  [MqttotFieldType.INT_32]: thrift.Thrift.Type.I32,
  [MqttotFieldType.INT_64]: thrift.Thrift.Type.I64,
  [MqttotFieldType.DOUBLE]: thrift.Thrift.Type.DOUBLE,
  [MqttotFieldType.STRING]: thrift.Thrift.Type.STRING,
  [MqttotFieldType.STRUCT]: thrift.Thrift.Type.STRUCT,
  [MqttotFieldType.LIST]: thrift.Thrift.Type.LIST,
  [MqttotFieldType.SET]: thrift.Thrift.Type.SET,
  [MqttotFieldType.MAP]: thrift.Thrift.Type.MAP,
};

function unsafeMqttotTypeToThriftType(
  type: MqttotFieldType,
): thrift.Thrift.Type {
  if (type in THRIFT_TYPE_MAP) {
    return THRIFT_TYPE_MAP[type]!;
  }
  throw new Error(`Unsupported Mqttot type: ${type}`);
}

export class MqttotThriftWriteProtocol implements thrift.TProtocol {
  get buffer(): Buffer {
    return this._buffer;
  }
  get length(): number {
    return this._buffer.length;
  }

  #lastField = 0;
  #field = 0;
  #type = thrift.Thrift.Type.STOP;
  #stack: [number, number, thrift.Thrift.Type][] = [];

  constructor(private _buffer: Buffer) {}

  #pushStack() {
    this.#stack.push([this.#lastField, this.#field, this.#type]);
    this.#field = 0;
  }

  #popStack() {
    if (this.#stack.length === 0) {
      throw new Error("stack underflow");
    }
    [this.#lastField, this.#field, this.#type] = this.#stack.pop()!;
  }

  #writeByte(x: number) {
    this.#writeBuffer(Buffer.from([x]));
  }

  #writeBuffer(x: Buffer) {
    this._buffer = Buffer.concat([this._buffer, x]);
  }

  #writeWord(x: number) {
    this.#writeVarInt(toZigZag(x, 0x10));
  }

  #writeInt(x: number) {
    this.#writeVarInt(toZigZag(x, 0x20));
  }

  #writeVarInt(x: number) {
    while (true) {
      let byte = x & ~0x7f;
      if (byte === 0) {
        this.#writeByte(x);
        break;
      } else if (byte === -128) {
        // -128 = 0b1000_0000 but it's the last an no other bytes will follow
        this.#writeByte(0);
        break;
      } else {
        byte = (x & 0xff) | 0x80;
        this.#writeByte(byte);
        x = x >> 7;
      }
    }
  }

  #writeBigInt(x: bigint) {
    while (true) {
      if ((x & ~BigInt(0x7f)) === BigInt(0)) {
        this.#writeByte(Number(x));
        break;
      } else {
        this.#writeByte(Number((x & BigInt(0x7f)) | BigInt(0x80)));
        x = x >> BigInt(7);
      }
    }
  }

  #writeMqttotFieldBegin(field: number, type: MqttotFieldType) {
    const delta = field - this.#field;
    if (delta > 0 && delta <= 15) {
      this.#writeByte((delta << 4) | type);
    } else {
      this.#writeByte(type);
      this.#writeWord(delta);
    }
    this.#field = field;
  }

  writeStructBegin() {
    this.#pushStack();
  }

  writeStructEnd() {
    this.#popStack();
  }

  writeFieldBegin(_name: string, type: thrift.Thrift.Type, field: number) {
    this.#writeMqttotFieldBegin(field, unsafeThriftTypeToMqttotType(type));
    this.#lastField = this.#field;
    this.#field = field;
    this.#type = type;
  }

  writeFieldEnd() {
    return;
  }

  writeFieldStop() {
    this.#writeByte(MqttotFieldType.STOP);
  }

  writeString(x: string) {
    const buffer = Buffer.from(x, "utf8");
    this.#writeVarInt(buffer.length);
    this.#writeBuffer(buffer);
  }

  writeByte(x: number): void {
    this.#writeByte(x);
  }

  writeI16(x: number): void {
    this.#writeWord(x);
  }

  writeI32(x: number): void {
    this.#writeInt(x);
  }

  writeI64(x: number | thrift.Int64): void {
    let bigint: bigint;
    if (typeof x === "number") {
      bigint = BigInt(x);
    } else {
      bigint = int64ToBigint(x);
    }
    this.#writeBigInt(bigintToZigZag(bigint));
  }

  writeBool(x: boolean): void {
    this.#writeByte(x ? 1 : 0);
  }

  writeListBegin(type: thrift.Thrift.Type, size: number) {
    const mqttotType = unsafeThriftTypeToMqttotType(type);
    if (size < 0x0f) {
      this.#writeByte((size << 4) | mqttotType);
    } else {
      this.#writeByte(0xf0 | mqttotType);
      this.#writeVarInt(size);
    }
  }

  writeListEnd() {
    return;
  }

  writeMapBegin(
    keyType: thrift.Thrift.Type,
    valueType: thrift.Thrift.Type,
    size: number,
  ) {
    const keyMqttotType = unsafeThriftTypeToMqttotType(keyType);
    const valueMqttotType = unsafeThriftTypeToMqttotType(valueType);
    if (size === 0) {
      this.#writeByte(0);
    } else {
      this.#writeVarInt(size);
      this.#writeByte(((keyMqttotType & 0xf) << 4) | (valueMqttotType & 0xf));
    }
  }

  writeMapEnd() {
    return;
  }

  flush(): void {
    throw new Error("Method not implemented.");
  }

  writeMessageBegin(): void {
    throw new Error("Method not implemented.");
  }
  writeMessageEnd(): void {
    throw new Error("Method not implemented.");
  }
  writeSetBegin(): void {
    throw new Error("Method not implemented.");
  }
  writeSetEnd(): void {
    throw new Error("Method not implemented.");
  }
  writeDouble(): void {
    throw new Error("Method not implemented.");
  }
  writeBinary(): void {
    throw new Error("Method not implemented.");
  }
  readMessageBegin(): thrift.TMessage {
    throw new Error("Method not implemented.");
  }
  readMessageEnd(): void {
    throw new Error("Method not implemented.");
  }
  readStructBegin(): thrift.TStruct {
    throw new Error("Method not implemented.");
  }
  readStructEnd(): void {
    throw new Error("Method not implemented.");
  }
  readFieldBegin(): thrift.TField {
    throw new Error("Method not implemented.");
  }
  readFieldEnd(): void {
    throw new Error("Method not implemented.");
  }
  readMapBegin(): thrift.TMap {
    throw new Error("Method not implemented.");
  }
  readMapEnd(): void {
    throw new Error("Method not implemented.");
  }
  readListBegin(): thrift.TList {
    throw new Error("Method not implemented.");
  }
  readListEnd(): void {
    throw new Error("Method not implemented.");
  }
  readSetBegin(): thrift.TSet {
    throw new Error("Method not implemented.");
  }
  readSetEnd(): void {
    throw new Error("Method not implemented.");
  }
  readBool(): boolean {
    throw new Error("Method not implemented.");
  }
  readByte(): number {
    throw new Error("Method not implemented.");
  }
  readI16(): number {
    throw new Error("Method not implemented.");
  }
  readI32(): number {
    throw new Error("Method not implemented.");
  }
  readI64(): thrift.Int64 {
    throw new Error("Method not implemented.");
  }
  readDouble(): number {
    throw new Error("Method not implemented.");
  }
  readBinary(): Buffer {
    throw new Error("Method not implemented.");
  }
  readString(): string {
    throw new Error("Method not implemented.");
  }
  getTransport(): thrift.TTransport {
    throw new Error("Method not implemented.");
  }
  skip(): void {
    throw new Error("Method not implemented.");
  }
}

export class MqttotThriftReadProtocol implements thrift.TProtocol {
  #position = 0;
  #field = 0;
  #mqttotType = 0;
  #stack: number[] = [];

  constructor(private _buffer: Buffer) {}

  #move(bytes: number) {
    this.#position = Math.min(
      Math.max(this.#position + bytes, 0),
      this._buffer.length,
    );
    return this.#position - bytes;
  }

  #pushStack() {
    this.#stack.push(this.#field);
    this.#field = 0;
  }

  #popStack() {
    if (this.#stack.length === 0) {
      throw new Error("stack underflow");
    }
    this.#field = this.#stack.pop()!;
  }

  #readByte() {
    return this._buffer.readUint8(this.#move(1));
  }

  #readSByte() {
    return this._buffer.readInt8(this.#move(1));
  }

  #readVarInt() {
    let shift = 0;
    let result = 0;
    while (this.#position < this._buffer.length) {
      const byte = this.#readByte();
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        break;
      }
      shift += 7;
    }
    return result;
  }

  #readVarBigint() {
    let shift = BigInt(0);
    let result = BigInt(0);
    while (true) {
      const byte = this.#readByte();
      result = result | ((BigInt(byte) & BigInt(0x7f)) << shift);
      if ((byte & 0x80) !== 0x80) {
        break;
      }
      shift += BigInt(7);
    }
    return result;
  }

  #readBigint() {
    return zigZagToBigint(this.#readVarBigint());
  }

  #readSmallInt() {
    return fromZigZag(this.#readVarInt());
  }

  #readString(length: number) {
    return this._buffer.toString("utf8", this.#move(length), this.#position);
  }

  readStructBegin(): thrift.TStruct {
    this.#pushStack();
    return { fname: "" };
  }

  readStructEnd(): void {
    this.#popStack();
  }

  readFieldBegin(): thrift.TField {
    const byte = this.#readByte();
    if (byte === (MqttotFieldType.STOP as number)) {
      return {
        fname: "",
        ftype: thrift.Thrift.Type.STOP,
        fid: 0,
      };
    }
    const delta = (byte & 0xf0) >> 4;
    if (delta === 0) {
      this.#field = this.#readSmallInt();
    } else {
      this.#field += delta;
    }
    this.#mqttotType = byte & 0x0f;
    return {
      fname: "",
      ftype: unsafeMqttotTypeToThriftType(this.#mqttotType),
      fid: this.#field,
    };
  }

  readFieldEnd(): void {
    return;
  }

  readMapBegin(): thrift.TMap {
    const size = this.#readVarInt();
    const kvByte = size ? this.#readByte() : 0;
    const keyType = unsafeMqttotTypeToThriftType((kvByte & 0x0f) >> 4);
    const valueType = unsafeMqttotTypeToThriftType(kvByte & 0xf);
    return {
      ktype: keyType,
      vtype: valueType,
      size,
    };
  }

  readMapEnd(): void {
    return;
  }

  readListBegin(): thrift.TList {
    const byte = this.#readByte();
    let size = byte >> 4;
    const listType = unsafeMqttotTypeToThriftType(byte & 0x0f);
    if (size === 0x0f) {
      size = this.#readVarInt();
    }
    return {
      etype: listType,
      size,
    };
  }

  readListEnd(): void {
    return;
  }

  readSetBegin(): thrift.TSet {
    throw new Error("Method not implemented.");
  }

  readSetEnd(): void {
    throw new Error("Method not implemented.");
  }

  readBool(): boolean {
    return this.#readByte() !== 0;
  }

  readByte(): number {
    return this.#readSByte();
  }

  readI16(): number {
    return this.#readSmallInt();
  }

  readI32(): number {
    return this.#readSmallInt();
  }

  readI64(): thrift.Int64 {
    return bigintToInt64(this.#readBigint());
  }

  readDouble(): number {
    throw new Error("Method not implemented.");
  }

  readBinary(): Buffer {
    throw new Error("Method not implemented.");
  }

  readString(): string {
    return this.#readString(this.#readVarInt());
  }

  skip(fieldType: thrift.Thrift.Type): void {
    throw new Error(`Skipped field type: ${fieldType}`);
  }

  flush(): void {
    throw new Error("Method not implemented.");
  }
  readMessageBegin(): thrift.TMessage {
    throw new Error("Method not implemented.");
  }
  readMessageEnd(): void {
    throw new Error("Method not implemented.");
  }
  writeMessageBegin(): void {
    throw new Error("Method not implemented.");
  }
  writeMessageEnd(): void {
    throw new Error("Method not implemented.");
  }
  writeStructBegin(): void {
    throw new Error("Method not implemented.");
  }
  writeStructEnd(): void {
    throw new Error("Method not implemented.");
  }
  writeFieldBegin(): void {
    throw new Error("Method not implemented.");
  }
  writeFieldEnd(): void {
    throw new Error("Method not implemented.");
  }
  writeFieldStop(): void {
    throw new Error("Method not implemented.");
  }
  writeMapBegin(): void {
    throw new Error("Method not implemented.");
  }
  writeMapEnd(): void {
    throw new Error("Method not implemented.");
  }
  writeListBegin(): void {
    throw new Error("Method not implemented.");
  }
  writeListEnd(): void {
    throw new Error("Method not implemented.");
  }
  writeSetBegin(): void {
    throw new Error("Method not implemented.");
  }
  writeSetEnd(): void {
    throw new Error("Method not implemented.");
  }
  writeBool(): void {
    throw new Error("Method not implemented.");
  }
  writeByte(): void {
    throw new Error("Method not implemented.");
  }
  writeI16(): void {
    throw new Error("Method not implemented.");
  }
  writeI32(): void {
    throw new Error("Method not implemented.");
  }
  writeI64(): void {
    throw new Error("Method not implemented.");
  }
  writeDouble(): void {
    throw new Error("Method not implemented.");
  }
  writeString(): void {
    throw new Error("Method not implemented.");
  }
  writeBinary(): void {
    throw new Error("Method not implemented.");
  }
  getTransport(): thrift.TTransport {
    throw new Error("Method not implemented.");
  }
}

function toZigZag(x: number, bits: number) {
  return (x << 1) ^ (x >> (bits - 1));
}

function fromZigZag(x: number) {
  return (x >> 1) ^ -(x & 1);
}

function bigintToZigZag(x: bigint) {
  return (x << BigInt(1)) ^ (x >> BigInt(63));
}

function zigZagToBigint(x: bigint) {
  return (x >> BigInt(1)) ^ -(x & BigInt(1));
}
