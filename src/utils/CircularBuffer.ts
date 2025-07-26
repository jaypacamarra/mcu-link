export interface DataPoint {
  timestamp: number;
  value: number;
}

export class CircularBuffer {
  private buffer: DataPoint[];
  private head: number = 0;
  private size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(value: number): void {
    const timestamp = Date.now();
    this.buffer[this.head] = { timestamp, value };
    this.head = (this.head + 1) % this.capacity;
    
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  getAll(): DataPoint[] {
    if (this.size === 0) return [];
    
    const result: DataPoint[] = [];
    let index = this.size < this.capacity ? 0 : this.head;
    
    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[index]);
      index = (index + 1) % this.capacity;
    }
    
    return result;
  }

  getLatest(): DataPoint | null {
    if (this.size === 0) return null;
    
    const latestIndex = this.head === 0 ? this.capacity - 1 : this.head - 1;
    return this.buffer[latestIndex];
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }

  getSize(): number {
    return this.size;
  }

  isFull(): boolean {
    return this.size === this.capacity;
  }
}