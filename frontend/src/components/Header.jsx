function Header({ abrir }) {

  return (

    <header className="topbar">

      <div>

        <span className="eyebrow">
          Visão financeira
        </span>

        <h1>
          FinancePro
        </h1>

        <p>
          Controle financeiro completo da operação.
        </p>

      </div>


      <div className="topbar-actions">

        <button
          className="secondary-button"
          onClick={abrir}
        >
          Nova despesa
        </button>


        <button
          className="primary-button"
          onClick={abrir}
        >
          Nova receita
        </button>


      </div>


    </header>

  );

}


export default Header;