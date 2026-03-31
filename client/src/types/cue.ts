export interface Cue {
  id: string;
  cueNumber: number;
  name: string;
  title: string;
  subtitle?: string;
}

export interface CueList {
  cues: Cue[];
  selectedIndex: number;
}
