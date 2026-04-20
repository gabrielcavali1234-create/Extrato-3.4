
export enum TransactionType {
  INFLOW = 'ENTRADA',
  OUTFLOW = 'SAÍDA'
}

export interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
}

export interface StatementAnalysis {
  transactions: Transaction[];
  totalInflow: number;
  totalOutflow: number;
  netBalance: number;
  currency: string;
  summary: string;
}

export interface AppState {
  isAnalyzing: boolean;
  analysis: StatementAnalysis | null;
  error: string | null;
  executionTime?: number;
  processingFiles: ProcessingFile[];
  analystName: string;
  clientName: string;
  isAuthenticated: boolean;
}

export interface ProcessingFile {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}
