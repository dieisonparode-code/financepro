import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function GraficoFinanceiro({
  receitas = 0,
  despesas = 0,
}) {
  const dados = [
    {
      nome: "Financeiro",
      Receitas: Number(receitas || 0),
      Despesas: Number(despesas || 0),
    },
  ];

  const formatarMoeda = (valor) =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <article className="panel chart-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Comparativo</span>
          <h2>Receitas x Despesas</h2>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={dados}
            margin={{
              top: 20,
              right: 20,
              left: 15,
              bottom: 10,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis dataKey="nome" />

            <YAxis
              tickFormatter={(valor) =>
                Number(valor).toLocaleString("pt-BR")
              }
            />

            <Tooltip
              formatter={(valor) => formatarMoeda(valor)}
            />

            <Legend />

            <Bar
              dataKey="Receitas"
              name="Receitas"
              fill="#22c55e"
              radius={[8, 8, 0, 0]}
              maxBarSize={90}
            />

            <Bar
              dataKey="Despesas"
              name="Despesas"
              fill="#ef4444"
              radius={[8, 8, 0, 0]}
              maxBarSize={90}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export default GraficoFinanceiro;