// === Stdin from Claude Code ===

export interface StdinData {
  model: {
    id?: string;
    display_name?: string;
  };
  context_window: {
    context_window_size?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    used_percentage?: number;
    remaining_percentage?: number;
  };
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number };
    seven_day?: { used_percentage?: number; resets_at?: number };
  };
  transcript_path?: string;
  cwd?: string;
}

// === Parsed context state ===

export interface ContextHealth {
  percent: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  windowSize: number;
  model: string;
}

// === Transcript parsed state ===

export interface ToolEntry {
  id: string;
  name: string;
  target: string;
  status: 'running' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
}

export interface AgentEntry {
  id: string;
  type: string;
  model?: string;
  description: string;
  status: 'running' | 'completed';
  startTime: number;
}

export interface TodoEntry {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface TranscriptState {
  tools: ToolEntry[];
  agents: AgentEntry[];
  todos: TodoEntry[];
  sessionStart?: number;
  sessionTitle?: string;
}

export interface TranscriptCache {
  mtime: number;
  size: number;
  state: TranscriptState;
}

// === Config ===

export type ColorValue = string;

export interface VitalsConfig {
  layout: 'expanded' | 'compact' | 'minimal' | 'auto';
  show: {
    contextBar: boolean;
    cost: boolean;
    git: boolean;
    tools: boolean;
    agents: boolean;
    todos: boolean;
    memory: boolean;
    speed: boolean;
    duration: boolean;
  };
  contextValue: 'percent' | 'tokens' | 'both';
  thresholds: {
    contextWarn: number;
    contextDanger: number;
    sevenDayShow: number;
  };
  colors: {
    healthy: ColorValue;
    warning: ColorValue;
    danger: ColorValue;
    accent: ColorValue;
    muted: ColorValue;
  };
  git: {
    showDirty: boolean;
    showAheadBehind: boolean;
    showFileStats: boolean;
  };
}

// === Git state ===

export interface GitState {
  branch: string;
  dirty: boolean;
  added: number;
  modified: number;
  deleted: number;
  untracked: number;
  ahead: number;
  behind: number;
}

// === Render output ===

export type LayoutMode = 'expanded' | 'compact' | 'minimal';

export interface RenderContext {
  stdin: StdinData;
  context: ContextHealth;
  transcript: TranscriptState;
  git: GitState | null;
  config: VitalsConfig;
  cost: number;
  sessionDuration: number;
  terminalWidth: number;
  layoutMode: LayoutMode;
  memoryUsage?: { used: number; total: number };
  speed?: number;
  updateAvailable?: boolean;
  shipsafe?: import('./shipsafe.ts').ShipSafeState | null;
}
