
import { GoogleGenAI, Type } from "@google/genai";
import { StatementAnalysis, TransactionType } from "./types";

// Removed global API_KEY constant to use process.env.API_KEY directly as per guidelines

export const analyzeStatement = async (base64Data: string, mimeType: string): Promise<StatementAnalysis> => {
  // Always use a named parameter and obtain API key directly from process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analise este extrato bancário com precisão absoluta. 
    Sua tarefa é extrair todas as transações, identificando a data, descrição, valor e se é uma ENTRADA (crédito) ou SAÍDA (débito).
    
    Regras Críticas:
    1. Formato de Data: Extraia a data no formato DD/MM/AAAA. Se o ano não estiver visível, use o ano corrente.
    2. Ignore saldos parciais, taxas de manutenção se não forem transações reais, e cabeçalhos.
    3. Certifique-se de que os valores numéricos sejam precisos.
    4. Categorize cada transação de forma inteligente (ex: Alimentação, Transporte, Salário, Transferência).
    5. Calcule o total de entradas, total de saídas e o saldo líquido para o período completo.
    
    Retorne os dados estritamente no formato JSON solicitado.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  description: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  type: { type: Type.STRING, enum: [TransactionType.INFLOW, TransactionType.OUTFLOW] },
                  category: { type: Type.STRING }
                },
                required: ["date", "description", "amount", "type", "category"]
              }
            },
            totalInflow: { type: Type.NUMBER },
            totalOutflow: { type: Type.NUMBER },
            netBalance: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            summary: { type: Type.STRING }
          },
          required: ["transactions", "totalInflow", "totalOutflow", "netBalance", "summary"]
        }
      }
    });

    // Access the text property directly from the response object as per guidelines
    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    // Basic validation to prevent crashes in the frontend
    if (!result.transactions || !Array.isArray(result.transactions)) {
      throw new Error("O extrato não pôde ser lido corretamente. Tente uma imagem mais nítida.");
    }
    
    return result as StatementAnalysis;
  } catch (error) {
    console.error("Erro na análise do Gemini:", error);
    throw new Error("Falha ao processar o extrato. Verifique a qualidade da imagem.");
  }
};
