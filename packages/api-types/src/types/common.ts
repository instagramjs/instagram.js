export type ImageVersions2Dto = {
  candidates: {
    width: number;
    height: number;
    url: string;
    scans_profile?: string;
    estimated_scans_sizes?: number[];
  }[];
  additional_candidates?: {
    igtv_first_frame?: {
      width: number;
      height: number;
      url: string;
      scans_profile?: string;
    } | null;
    first_frame: {
      width: number;
      height: number;
      url: string;
      scans_profile?: string;
    } | null;
  };
};

export type VideoVersionDto = {
  id: string;
  width: number;
  height: number;
  type: number;
  url: string;
};
