import type thrift from "thrift";

import {
  MqttotThriftReadProtocol,
  MqttotThriftWriteProtocol,
} from "./protocol";

export type ThriftStruct = {
  write(protocol: thrift.TProtocol): void;
};

export type ThriftStructClass<T extends ThriftStruct> = {
  new (...args: never[]): T;
  read(protocol: thrift.TProtocol): T;
};

export function serializeThrift(struct: ThriftStruct) {
  const protocol = new MqttotThriftWriteProtocol(Buffer.alloc(0));
  struct.write(protocol);
  return protocol.buffer;
}

export function deserializeThrift<T extends ThriftStruct>(
  structClass: ThriftStructClass<T>,
  buffer: Buffer,
): T {
  const protocol = new MqttotThriftReadProtocol(buffer);
  return structClass.read(protocol);
}
