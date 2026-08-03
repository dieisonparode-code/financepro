import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function GraficoCategorias({ despesasPorCategoria = [] }) {
  const cores = [
    "#ef4444",
    "#f59e0b",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];

  const dados = despesasPorCategoria.map((item) => ({
    nome: item.categoria,
    valor: Number(item.valor),
  }));

  const formatarValor = (valor) =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Custos</span>
          <h2>Despesas por categoria</h2>
        </div>
      </div>

      {dados.length === 0 ? (
        <p>Nenhuma despesa registrada.</p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="nome"
              cx="50%"
              cy="50%"
              outerRadius={110}
              label
            >
              {dados.map((item, index) => (
                <Cell
                  key={item.nome}
                  fill={cores[index % cores.length]}
                />
              ))}
            </Pie>

            <Tooltip formatter={(valor) => formatarValor(valor)} />

            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default GraficoCategorias;