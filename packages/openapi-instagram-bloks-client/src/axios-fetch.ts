import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

export async function axiosFetch(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input.url;
  const method =
    init?.method || (typeof input === "string" ? "GET" : input.method) || "GET";
  const headers =
    init?.headers || (typeof input === "string" ? undefined : input.headers);
  const data = typeof input !== "string" ? await input.text() : init?.body;

  const config: AxiosRequestConfig = {
    url,
    method: method.toLowerCase() as AxiosRequestConfig["method"],
    headers: headers as AxiosRequestConfig["headers"],
    data,
    validateStatus: () => true,
  };

  const axiosResponse: AxiosResponse = await axios(config);

  const response = new Response(
    typeof axiosResponse.data === "string"
      ? axiosResponse.data
      : JSON.stringify(axiosResponse.data),
    {
      status: axiosResponse.status,
      statusText: axiosResponse.statusText,
      headers: axiosResponse.headers as unknown as HeadersInit,
    },
  );

  return response;
}
