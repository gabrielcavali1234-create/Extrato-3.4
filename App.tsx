
// AuditFlow AI - Extrato Inteligente
// Versão: 1.0.1
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  PlusCircle, 
  MinusCircle, 
  Wallet, 
  Upload, 
  FileText, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  RefreshCcw,
  CheckCircle2,
  X,
  Filter,
  Search,
  Download,
  CalendarDays,
  BarChart3,
  Calculator,
  Timer,
  Zap,
  Tag,
  CheckSquare,
  Square,
  ListFilter,
  Check,
  Trash2,
  Share2,
  Calendar,
  Lock,
  User,
  LogIn
} from 'lucide-react';
import { analyzeStatement } from './geminiService';
import { StatementAnalysis, AppState, TransactionType, Transaction } from './types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    isAnalyzing: false,
    analysis: null,
    error: null,
    executionTime: 0,
    processingFiles: [],
    analystName: '',
    clientName: '',
    isAuthenticated: false
  });

  const [loginForm, setLoginForm] = useState({ username: '', password: '', error: '' });

  const [timerSeconds, setTimerSeconds] = useState(0);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  const timerIntervalRef = useRef<number | null>(null);
  const cancelRef = useRef(false);

  const handleCancelAnalysis = () => {
    cancelRef.current = true;
    setState(prev => ({ 
      ...prev, 
      isAnalyzing: false, 
      processingFiles: [],
      error: "Apuração cancelada pelo usuário."
    }));
  };

  // Efeito para o cronômetro visual em tempo real
  useEffect(() => {
    if (state.isAnalyzing) {
      setTimerSeconds(0);
      timerIntervalRef.current = window.setInterval(() => {
        setTimerSeconds(prev => prev + 0.1);
      }, 100);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [state.isAnalyzing]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    const initialProcessingFiles = fileList.map((f: File) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: f.name,
      status: 'pending' as const
    }));

    setState(prev => ({ 
      ...prev, 
      isAnalyzing: true, 
      error: null, 
      processingFiles: initialProcessingFiles 
    }));
    
    cancelRef.current = false;
    const startTime = performance.now();
    const allResults: StatementAnalysis[] = [];
    const errors: string[] = [];

    // Process files
    const processFile = async (file: File, index: number) => {
      const fileId = initialProcessingFiles[index].id;
      
      setState(prev => ({
        ...prev,
        processingFiles: prev.processingFiles.map(pf => 
          pf.id === fileId ? { ...pf, status: 'processing' as const } : pf
        )
      }));

      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          if (cancelRef.current) {
            resolve();
            return;
          }
          const base64 = (e.target?.result as string).split(',')[1];
          try {
            const result = await analyzeStatement(base64, file.type);
            if (cancelRef.current) {
              resolve();
              return;
            }
            allResults.push(result);
            setState(prev => ({
              ...prev,
              processingFiles: prev.processingFiles.map(pf => 
                pf.id === fileId ? { ...pf, status: 'completed' as const } : pf
              )
            }));
          } catch (err: any) {
            errors.push(`${file.name}: ${err.message}`);
            setState(prev => ({
              ...prev,
              processingFiles: prev.processingFiles.map(pf => 
                pf.id === fileId ? { ...pf, status: 'error' as const, error: err.message } : pf
              )
            }));
          }
          resolve();
        };
        reader.onerror = () => {
          errors.push(`${file.name}: Erro ao ler arquivo.`);
          setState(prev => ({
            ...prev,
            processingFiles: prev.processingFiles.map(pf => 
              pf.id === fileId ? { ...pf, status: 'error' as const, error: "Erro ao ler arquivo." } : pf
            )
          }));
          resolve();
        };
        reader.readAsDataURL(file);
      });
    };

    // Process all files (parallel)
    await Promise.all(fileList.map((file, index) => processFile(file, index)));

    if (cancelRef.current) return;

    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;

    if (allResults.length > 0) {
      // Merge results with safety check
      const mergedTransactions = allResults.flatMap(r => r.transactions || []);
      
      if (mergedTransactions.length === 0) {
        setState(prev => ({ 
          ...prev, 
          isAnalyzing: false, 
          analysis: null, 
          error: "Nenhuma transação encontrada nos arquivos.",
          executionTime: duration 
        }));
        return;
      }
      
      // Sort transactions by date
      mergedTransactions.sort((a, b) => {
        try {
          const dateA = parseDate(a.date);
          const dateB = parseDate(b.date);
          return dateA.getTime() - dateB.getTime();
        } catch (e) {
          return 0;
        }
      });

      const totalInflow = mergedTransactions
        .filter(t => t.type === TransactionType.INFLOW)
        .reduce((sum, t) => sum + t.amount, 0);

      const totalOutflow = mergedTransactions
        .filter(t => t.type === TransactionType.OUTFLOW)
        .reduce((sum, t) => sum + t.amount, 0);

      const mergedAnalysis: StatementAnalysis = {
        transactions: mergedTransactions,
        totalInflow,
        totalOutflow,
        netBalance: totalInflow - totalOutflow,
        currency: allResults[0].currency || 'R$',
        summary: allResults.length > 1 
          ? `Análise consolidada de ${allResults.length} documentos. ${allResults.map((r, i) => `Doc ${i+1}: ${r.summary}`).join(' ')}`
          : allResults[0].summary
      };

      setState(prev => ({ 
        ...prev, 
        isAnalyzing: false, 
        analysis: mergedAnalysis, 
        error: errors.length > 0 ? `Alguns arquivos falharam: ${errors.join('; ')}` : null,
        executionTime: duration 
      }));
    } else {
      setState(prev => ({ 
        ...prev, 
        isAnalyzing: false, 
        analysis: null, 
        error: errors.length > 0 ? `Falha ao processar arquivos: ${errors.join('; ')}` : "Nenhum arquivo processado com sucesso.",
        executionTime: duration 
      }));
    }
  };

  const addKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    const val = keywordInput.trim().toLowerCase();
    if (val && !excludedKeywords.includes(val)) {
      setExcludedKeywords([...excludedKeywords, val]);
      setKeywordInput('');
    }
  };

  const removeKeyword = (kw: string) => {
    setExcludedKeywords(excludedKeywords.filter(k => k !== kw));
  };

  const toggleCategory = (category: string) => {
    if (excludedCategories.includes(category)) {
      setExcludedCategories(excludedCategories.filter(c => c !== category));
    } else {
      setExcludedCategories([...excludedCategories, category]);
    }
  };

  const selectAllCategories = () => setExcludedCategories([]);
  const deselectAllCategories = () => {
    if (allCategories.length > 0) {
      setExcludedCategories([...allCategories]);
    }
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr || typeof dateStr !== 'string') return new Date();
    // dateStr in DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length < 3) return new Date();
    const [d, m, y] = parts;
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  };

  // List all available categories from raw data
  const allCategories = useMemo(() => {
    if (!state.analysis) return [];
    const cats = new Set<string>();
    state.analysis.transactions.forEach(t => cats.add(t.category));
    return Array.from(cats).sort();
  }, [state.analysis]);

  const filteredData = useMemo(() => {
    if (!state.analysis) return null;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const transactions = state.analysis.transactions.filter(t => {
      // Keyword filter
      const desc = t.description.toLowerCase();
      const isKeywordExcluded = excludedKeywords.some(kw => desc.includes(kw));
      if (isKeywordExcluded) return false;

      // Category filter
      const isCategoryExcluded = excludedCategories.includes(t.category);
      if (isCategoryExcluded) return false;

      // Date range filter
      if (start || end) {
        const tDate = parseDate(t.date);
        if (start && tDate < start) return false;
        if (end && tDate > end) return false;
      }

      return true;
    });

    const totalInflow = transactions
      .filter(t => t.type === TransactionType.INFLOW)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalOutflow = transactions
      .filter(t => t.type === TransactionType.OUTFLOW)
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      transactions,
      totalInflow,
      totalOutflow,
      netBalance: totalInflow - totalOutflow
    };
  }, [state.analysis, excludedKeywords, excludedCategories, startDate, endDate]);

  const monthlyGroups = useMemo(() => {
    if (!filteredData) return [];
    const groups: Record<string, { transactions: Transaction[], inflow: number, outflow: number }> = {};
    
    filteredData.transactions.forEach(t => {
      if (!t.date || typeof t.date !== 'string') return;
      const parts = t.date.split('/');
      const key = parts.length >= 2 ? `${parts[1]}/${parts[2] || '?'}` : 'Outros';
      
      if (!groups[key]) groups[key] = { transactions: [], inflow: 0, outflow: 0 };
      groups[key].transactions.push(t);
      if (t.type === TransactionType.INFLOW) groups[key].inflow += t.amount;
      else groups[key].outflow += t.amount;
    });

    return Object.entries(groups).map(([month, data]) => ({
      month,
      ...data,
      balance: data.inflow - data.outflow
    })).sort((a, b) => {
      if (a.month === 'Outros') return 1;
      if (b.month === 'Outros') return -1;
      
      const partsA = a.month.split('/');
      const partsB = b.month.split('/');
      
      if (partsA.length < 2 || partsB.length < 2) return 0;
      
      const [mA, yA] = partsA;
      const [mB, yB] = partsB;
      
      const dateA = new Date(parseInt(yA) || 0, (parseInt(mA) || 1) - 1);
      const dateB = new Date(parseInt(yB) || 0, (parseInt(mB) || 1) - 1);
      return dateA.getTime() - dateB.getTime();
    });
  }, [filteredData]);

  const averages = useMemo(() => {
    if (!filteredData || monthlyGroups.length === 0) return null;
    const numMonths = monthlyGroups.length;
    return {
      inflow: filteredData.totalInflow / numMonths,
      outflow: filteredData.totalOutflow / numMonths,
      balance: filteredData.netBalance / numMonths,
      count: numMonths
    };
  }, [filteredData, monthlyGroups]);

  const createPDFBlob = () => {
    if (!state.analysis || !filteredData || !averages) return null;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Estilo do Cabeçalho
    doc.setFillColor(79, 70, 229); 
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('AuditFlow AI', 20, 22);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Relatório Executivo de Auditoria Inteligente', 20, 28);
    doc.setFontSize(8);
    doc.text(`Tempo de Processamento IA: ${state.executionTime?.toFixed(2)}s`, 20, 34);
    
    doc.setFontSize(10);
    doc.text(`Cliente: ${state.clientName || 'Não informado'}`, pageWidth - 20, 28, { align: 'right' });
    doc.text(`Analista: ${state.analystName || 'Não informado'}`, pageWidth - 20, 34, { align: 'right' });
    
    doc.text(new Date().toLocaleString('pt-BR'), pageWidth - 20, 22, { align: 'right' });

    // Tabela 1: Resumo Consolidado e Médias
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Resumo Consolidado do Período', 20, 55);

    autoTable(doc, {
      startY: 60,
      head: [['Métrica', 'Total Acumulado', 'Média Mensal']],
      body: [
        ['Entradas Totais', 
         `${state.analysis.currency} ${filteredData.totalInflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
         `${state.analysis.currency} ${averages.inflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ],
        ['Saídas Totais', 
         `${state.analysis.currency} ${filteredData.totalOutflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
         `${state.analysis.currency} ${averages.outflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ],
        ['Resultado Líquido', 
         `${state.analysis.currency} ${filteredData.netBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
         `${state.analysis.currency} ${averages.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 
        1: { halign: 'right' },
        2: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Tabela 2: Resultados Finais por Mês
    const nextY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Desempenho Mensal (Resultado por Mês)', 20, nextY);

    autoTable(doc, {
      startY: nextY + 5,
      head: [['Mês/Ano', 'Entradas', 'Saídas', 'Saldo Final']],
      body: monthlyGroups.map(group => [
        group.month,
        `${state.analysis?.currency} ${group.inflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `${state.analysis?.currency} ${group.outflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `${state.analysis?.currency} ${group.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      ]),
      theme: 'striped',
      headStyles: { fillColor: [71, 85, 105] },
      columnStyles: { 
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Conclusão da IA
    const summaryY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Conclusão Analítica (IA)', 20, summaryY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    const splitSummary = doc.splitTextToSize(state.analysis.summary, pageWidth - 40);
    doc.text(splitSummary, 20, summaryY + 7);

    return doc;
  };

  const handleExportPDF = () => {
    const doc = createPDFBlob();
    if (doc) {
      doc.save(`Auditoria_AuditFlow_${Date.now()}.pdf`);
    }
  };

  const handleSharePDF = async () => {
    const doc = createPDFBlob();
    if (!doc) return;

    const pdfBlob = doc.output('blob');
    const fileName = `Auditoria_AuditFlow_${Date.now()}.pdf`;
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Relatório AuditFlow AI',
          text: 'Confira a auditoria inteligente do extrato bancário.'
        });
      } catch (err) {
        console.error('Erro ao compartilhar:', err);
      }
    } else {
      alert('Seu navegador não suporta compartilhamento de arquivos. O relatório será baixado.');
      handleExportPDF();
    }
  };

  const reset = () => {
    setState(prev => ({ 
      ...prev,
      isAnalyzing: false, 
      analysis: null, 
      error: null, 
      executionTime: 0, 
      processingFiles: [],
      clientName: ''
    }));
    setExcludedKeywords([]);
    setExcludedCategories([]);
    setStartDate('');
    setEndDate('');
  };

  const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

  const categoryData = useMemo(() => {
    if (!filteredData) return [];
    
    const totals = filteredData.transactions
      .filter(t => t.type === TransactionType.OUTFLOW)
      .reduce<Record<string, number>>((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {});
    
    const totalOutflow = (Object.values(totals) as number[]).reduce<number>((sum, val) => sum + val, 0);
    
    return (Object.entries(totals) as [string, number][])
      .map(([name, value]) => ({ 
        name, 
        value, 
        percentage: totalOutflow > 0 ? (value / totalOutflow) * 100 : 0 
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginForm.username === 'Gabriel Cavali' && loginForm.password === '772177') {
      setState(prev => ({ ...prev, isAuthenticated: true, analystName: 'Gabriel Cavali' }));
    } else {
      setLoginForm(prev => ({ ...prev, error: 'Usuário ou senha incorretos.' }));
    }
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, isAuthenticated: false, analysis: null }));
  };

  if (!state.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 p-8 text-center text-white">
            <div className="bg-white/20 w-16 h-16 rounded-2xl backdrop-blur-md flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold">AuditFlow AI</h1>
            <p className="text-indigo-100 text-sm mt-1">Acesso Restrito ao Sistema</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Usuário</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  value={loginForm.username}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value, error: '' }))}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Seu nome de usuário"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="password" 
                  value={loginForm.password}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value, error: '' }))}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Sua senha numérica"
                  required
                />
              </div>
            </div>

            {loginForm.error && (
              <div className="flex items-center gap-2 text-rose-500 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100">
                <AlertCircle className="w-4 h-4" />
                {loginForm.error}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Entrar no Sistema
            </button>
          </form>
          
          <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">AuditFlow Engine v3.2</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Wallet className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              AuditFlow AI
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {state.analysis && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 border border-slate-200">
                <Timer className="w-3 h-3 text-indigo-500" />
                Auditado em {state.executionTime?.toFixed(2)}s
              </div>
            )}
            
            <div className="flex items-center gap-2">
              {state.analysis && (
                <>
                  <button 
                    onClick={handleExportPDF}
                    className="bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 shadow-sm transition-all"
                  >
                    <Download className="w-4 h-4" />
                    PDF
                  </button>
                  <button 
                    onClick={handleSharePDF}
                    className="bg-indigo-50 text-indigo-600 text-sm font-bold px-4 py-2 rounded-lg hover:bg-indigo-100 flex items-center gap-2 border border-indigo-100 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                    Compartilhar
                  </button>
                  <button 
                    onClick={reset}
                    className="text-sm font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors px-2"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Novo
                  </button>
                </>
              )}
              
              <button 
                onClick={handleLogout}
                className="text-sm font-medium text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors border-l border-slate-200 pl-4 ml-2"
              >
                <LogIn className="w-4 h-4 rotate-180" />
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-8">
        {state.error && !state.isAnalyzing && !state.analysis && (
          <section className="max-w-2xl mx-auto py-12">
            <div className="bg-white p-8 rounded-3xl border border-rose-100 shadow-xl shadow-rose-50 text-center space-y-6 animate-in fade-in zoom-in duration-300">
              <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10 text-rose-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900">Ops! Algo deu errado</h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {state.error}
                </p>
              </div>
              <button 
                onClick={reset}
                className="inline-flex items-center gap-2 bg-slate-900 text-white font-bold px-8 py-3 rounded-xl hover:bg-slate-800 transition-all"
              >
                <RefreshCcw className="w-4 h-4" />
                Tentar Novamente
              </button>
            </div>
          </section>
        )}

        {!state.analysis && !state.isAnalyzing && !state.error && (
          <section className="max-w-2xl mx-auto py-12">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl mb-4">
                Auditoria Ultrarrápida de Extratos
              </h2>
              <p className="text-lg text-slate-600">
                Processamos meses de extratos em segundos, separando períodos e calculando médias automaticamente.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Nome do Cliente</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Ex: João Silva"
                      value={state.clientName}
                      onChange={(e) => setState(prev => ({ ...prev, clientName: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Analista Responsável</label>
                  <div className="relative">
                    <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Seu nome"
                      value={state.analystName}
                      onChange={(e) => setState(prev => ({ ...prev, analystName: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              </div>
            </div>

            <label className="relative group cursor-pointer block border-2 border-dashed border-slate-300 rounded-2xl p-12 hover:border-indigo-500 hover:bg-indigo-50/30 transition-all">
              <input type="file" className="hidden" accept="image/*,application/pdf" multiple onChange={handleFileUpload} />
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="text-indigo-600 w-8 h-8" />
                </div>
                <span className="text-lg font-semibold text-slate-700">Subir Extratos Bancários</span>
                <span className="text-xs text-slate-400 mt-2">Selecione um ou mais arquivos (PDF ou Imagens)</span>
                <span className="text-[10px] text-indigo-500 font-bold mt-1 uppercase tracking-widest">Tecnologia IA de apuração instantânea</span>
              </div>
            </label>
          </section>
        )}

        {state.isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in duration-300">
            <div className="relative mb-8">
              <div className="w-24 h-24 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Zap className="w-8 h-8 text-indigo-600 fill-indigo-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Auditoria em Progresso</h2>
            <div className="flex items-center gap-3 justify-center mb-6">
              <div className="px-4 py-2 bg-indigo-50 rounded-2xl border border-indigo-100 font-mono text-2xl font-bold text-indigo-600 shadow-sm min-w-[120px]">
                {timerSeconds.toFixed(1)}s
              </div>
            </div>
            
            <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 text-left flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <ListFilter className="w-3 h-3" />
                  Fila de Processamento ({state.processingFiles.length} arquivos)
                </h3>
                <button 
                  onClick={handleCancelAnalysis}
                  className="text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-widest flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Cancelar
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
                {state.processingFiles.map(file => (
                  <div key={file.id} className="px-4 py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className={`w-4 h-4 flex-shrink-0 ${file.status === 'completed' ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span className="truncate text-slate-700 font-medium">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {file.status === 'pending' && <span className="text-[10px] font-bold text-slate-400 uppercase">Pendente</span>}
                      {file.status === 'processing' && (
                        <div className="flex items-center gap-1.5">
                          <RefreshCcw className="w-3 h-3 text-indigo-500 animate-spin" />
                          <span className="text-[10px] font-bold text-indigo-500 uppercase">Lendo...</span>
                        </div>
                      )}
                      {file.status === 'completed' && (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span className="text-[10px] font-bold text-emerald-500 uppercase">OK</span>
                        </div>
                      )}
                      {file.status === 'error' && (
                        <div className="flex items-center gap-1.5" title={file.error}>
                          <AlertCircle className="w-3 h-3 text-rose-500" />
                          <span className="text-[10px] font-bold text-rose-500 uppercase">Erro</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-slate-500 max-w-sm">
              Nossa IA está lendo cada transação de todos os arquivos, separando por meses e consolidando os dados.
            </p>
          </div>
        )}

        {state.analysis && filteredData && averages && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Monthly Cards Scroll */}
            {monthlyGroups.length > 1 && (
              <div className="mb-8 overflow-x-auto pb-4 scrollbar-hide">
                <div className="flex gap-4 min-w-max px-2">
                  {monthlyGroups.map(group => (
                    <div key={group.month} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm w-64 hover:border-indigo-300 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-indigo-600 flex items-center gap-1">
                          <CalendarDays className="w-4 h-4" />
                          {group.month}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Entradas:</span>
                          <span className="text-emerald-600 font-bold">+{state.analysis?.currency} {group.inflow.toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Saídas:</span>
                          <span className="text-rose-600 font-bold">-{state.analysis?.currency} {group.outflow.toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="pt-2 border-t border-slate-50 flex justify-between text-sm font-bold">
                          <span className="text-slate-700">Saldo:</span>
                          <span className={group.balance >= 0 ? 'text-indigo-600' : 'text-rose-600'}>
                            {state.analysis?.currency} {group.balance.toLocaleString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Performance Metric Banner */}
            <div className="mb-8 bg-indigo-600 rounded-2xl p-6 shadow-lg text-white flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Zap className="w-32 h-32" />
              </div>
              <div className="flex items-center gap-4 relative z-10">
                <div className="bg-white/20 p-3 rounded-xl backdrop-blur-md">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Médias e Desempenho</h3>
                  <p className="text-indigo-100 text-sm">Auditoria finalizada em apenas {state.executionTime?.toFixed(2)}s</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 w-full md:w-auto relative z-10">
                <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                  <p className="text-[10px] uppercase font-bold opacity-70 mb-1">Entrada Média</p>
                  <p className="text-lg font-bold">{state.analysis.currency} {averages.inflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                  <p className="text-[10px] uppercase font-bold opacity-70 mb-1">Saída Média</p>
                  <p className="text-lg font-bold">{state.analysis.currency} {averages.outflow.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="col-span-2 md:col-span-1 bg-white p-3 rounded-xl text-indigo-700 shadow-inner">
                  <p className="text-[10px] uppercase font-bold opacity-70 mb-1">Saldo Médio Mensal</p>
                  <p className="text-lg font-bold">
                    {state.analysis.currency} {averages.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                {/* Unified Filters Section */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-8">
                  
                  {/* Date Filter */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-bold text-slate-800">Filtrar por Período</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Início</label>
                        <input 
                          type="date" 
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Fim</label>
                        <input 
                          type="date" 
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>
                    {(startDate || endDate) && (
                      <button 
                        onClick={() => {setStartDate(''); setEndDate('');}}
                        className="mt-3 text-[10px] font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Limpar Filtro de Data
                      </button>
                    )}
                  </div>

                  {/* Keyword Filter */}
                  <div className="border-t border-slate-100 pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Search className="w-5 h-5 text-indigo-500" />
                      <h3 className="font-bold text-slate-800">Busca por Descrição</h3>
                    </div>
                    <form onSubmit={addKeyword} className="flex gap-2 mb-4">
                      <input 
                        type="text" 
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        placeholder="Excluir lançamentos que contenham... (ex: Uber, Taxa)"
                        className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors">Filtrar</button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      {excludedKeywords.length > 0 && excludedKeywords.map(kw => (
                        <span key={kw} className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-100 flex items-center gap-1">
                          {kw}
                          <button onClick={() => removeKeyword(kw)} className="hover:text-indigo-900"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Category Filter */}
                  <div className="border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Tag className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-bold text-slate-800">Filtrar Categorias</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={selectAllCategories}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-tighter"
                        >
                          <Check className="w-3 h-3" /> Todas
                        </button>
                        <button 
                          onClick={deselectAllCategories}
                          className="text-[10px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 uppercase tracking-tighter"
                        >
                          <X className="w-3 h-3" /> Limpar
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {allCategories.map(cat => {
                        const isExcluded = excludedCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            onClick={() => toggleCategory(cat)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                              isExcluded 
                                ? 'bg-slate-50 text-slate-300 border-slate-100 line-through' 
                                : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 shadow-sm'
                            }`}
                          >
                            {isExcluded ? <Square className="w-3 h-3" /> : <CheckSquare className="w-3 h-3 text-indigo-600" />}
                            <span className="truncate">{cat}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Monthly Group Details */}
                <div className="space-y-6">
                  {monthlyGroups.map(group => (
                    <div key={group.month} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="w-4 h-4 text-indigo-600" />
                          <h3 className="font-bold text-slate-800">{group.month}</h3>
                        </div>
                        <div className="flex gap-4 text-xs font-bold">
                          <span className="text-emerald-600">Ent: +{group.inflow.toLocaleString('pt-BR')}</span>
                          <span className="text-rose-600">Sai: -{group.outflow.toLocaleString('pt-BR')}</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                              <th className="px-6 py-3">Dia</th>
                              <th className="px-6 py-3">Descrição</th>
                              <th className="px-6 py-3 text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.transactions.map((t, i) => (
                              <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 text-slate-400">{t.date.split('/')[0]}</td>
                                <td className="px-6 py-4">
                                  <div className="font-medium text-slate-800">{t.description}</div>
                                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.category}</div>
                                </td>
                                <td className={`px-6 py-4 text-right font-bold ${t.type === 'ENTRADA' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {t.type === 'ENTRADA' ? '+' : '-'} {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  {monthlyGroups.length === 0 && (
                    <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400">
                      Nenhuma transação disponível com os filtros atuais.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-8">
                {/* Executive Report Card */}
                <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
                   <div className="absolute -top-4 -right-4 bg-indigo-500/10 w-24 h-24 rounded-full blur-2xl"></div>
                  <h3 className="font-bold mb-3 flex items-center gap-2 text-indigo-400">
                    <FileText className="w-4 h-4" />
                    Relatório Executivo IA
                  </h3>
                  <p className="text-slate-300 text-sm italic leading-relaxed">"{state.analysis.summary}"</p>
                  <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-tighter opacity-50">
                    <span>AuditFlow Engine 3.0</span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      {state.executionTime?.toFixed(2)}s
                    </span>
                  </div>
                </div>
                
                {/* Expense Mix Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-6 uppercase text-[10px] tracking-[0.2em]">Mix de Despesas</h3>
                  {categoryData.length > 0 ? (
                    <>
                      <div className="h-64 mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryData}
                              cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value"
                            >
                              {categoryData.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip 
                              formatter={(v: any) => `R$ ${v.toLocaleString('pt-BR')}`}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="border-t border-slate-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                           <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Detalhamento Ativo</h4>
                           <span className="text-[9px] text-slate-300 italic">Clique no ícone de lixeira para remover</span>
                        </div>
                        <div className="space-y-3">
                          {categoryData.map((cat, i) => (
                            <div key={cat.name} className="flex items-center justify-between group">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                <span className="text-xs font-medium text-slate-600 group-hover:text-indigo-600 transition-colors">{cat.name}</span>
                              </div>
                              <div className="flex items-center gap-3 text-right">
                                <span className="text-xs font-bold text-slate-800">
                                  {state.analysis?.currency} {cat.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 w-10">
                                  {cat.percentage.toFixed(1)}%
                                </span>
                                <button 
                                  onClick={() => toggleCategory(cat.name)}
                                  className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                  title="Remover categoria da apuração"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-20 text-center text-slate-400 text-sm italic">
                      Nenhuma despesa para exibir com os filtros atuais.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
