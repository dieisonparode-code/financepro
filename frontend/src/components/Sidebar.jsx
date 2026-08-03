function Sidebar({ pagina, setPagina }) {

  return (

    <aside className="sidebar">

      <div className="brand">

        <div className="brand-icon">
          FP
        </div>

        <div>
          <strong>
            FinancePro
          </strong>

          <span>
            Gestão financeira
          </span>
        </div>

      </div>


      <nav className="menu">

        {[
          ["dashboard", "Dashboard"],
          ["receitas", "Receitas"],
          ["despesas", "Despesas"],
          ["categorias", "Categorias"],
          ["fluxo", "Fluxo de Caixa"],
          ["relatorios", "Relatórios"],
        ].map(([id, nome]) => (

          <button
            key={id}
            className={
              pagina === id
                ? "active"
                : ""
            }
            onClick={() =>
              setPagina(id)
            }
          >
            {nome}
          </button>

        ))}

      </nav>

    </aside>

  );

}

export default Sidebar;