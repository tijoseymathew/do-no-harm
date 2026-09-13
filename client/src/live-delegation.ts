/** Correlates Live's metadata-only delegations with server-grounded transcript turns. */
export class LiveDelegationBridge {
  private pending = new Set<string>();
  private seen = new Set<string>();
  private version = 0;
  private result: string | undefined;
  private active = true;

  constructor(private readonly send: (event: {
    type: "session.commentary.append";
    delegation_id: string;
    content: string;
  }) => void) {}

  inputChanged() {
    this.result = undefined;
    return ++this.version;
  }

  delegate(id: string) {
    if (!this.active || this.seen.has(id)) return;
    this.seen.add(id);
    this.pending.add(id);
    this.deliver();
  }

  resolve(version: number, result: string) {
    if (!this.active || version !== this.version) return;
    this.result = result;
    this.deliver();
  }

  close() {
    this.active = false;
    this.pending.clear();
  }

  private deliver() {
    if (!this.result) return;
    for (const id of this.pending) {
      this.send({ type: "session.commentary.append", delegation_id: id, content: this.result });
    }
    this.pending.clear();
  }
}
