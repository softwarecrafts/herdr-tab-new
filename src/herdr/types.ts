/** The subset of herdr's JSON we rely on. herdr sends more; we name only what we use. */

export type Pane = {
  pane_id: string;
  tab_id: string;
  workspace_id: string;
  cwd: string;
  focused: boolean;
  agent?: string;
};

export type Workspace = {
  workspace_id: string;
  label: string;
  focused: boolean;
  tab_count: number;
  pane_count: number;
};

export type Tab = {
  tab_id: string;
  workspace_id: string;
  label: string;
};

export type Session = {
  name: string;
  running: boolean;
  default: boolean;
  socket_path: string;
  session_dir: string;
};

export type AgentInfo = {
  agent: string;
  pane_id: string;
  tab_id?: string;
  workspace_id?: string;
  agent_status: string;
};
