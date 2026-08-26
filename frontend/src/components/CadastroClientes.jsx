import { useState } from "react";
import CampoValor, { paraNumero } from "./CampoValor";

function formatarData(data) {
  if (!data) return "Sem data";
  return new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR");
}

// Usa o fuso horário do dispositivo (não força UTC) — toISOString() já
// causou lançamento salvando com a data de amanhã perto da meia-noite
// local em fusos mais atrasados (ex.: Mato Grosso, UTC-4).
// BUG REAL corrigido (26/08/2026): usava o relógio/fuso do próprio
// aparelho — se estivesse errado, salvava com a data errada sem
// ninguém perceber. Agora usa sempre o fuso fixo da loja.
function hojeLocal() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function CadastroClientes({
  clientes = [],
  carregando = false,
  adicionarCliente,
  editarCliente,
  removerCliente,
  buscarAtendimentos,
  adicionarAtendimento,
  removerAtendimento,
}) {
  const [busca, setBusca] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const [clienteAberto, setClienteAberto] = useState(null);
  const [atendimentos, setAtendimentos] = useState([]);
  const [carregandoAtendimentos, setCarregandoAtendimentos] = useState(false);
  const [dataAtendimento, setDataAtendimento] = useState(hojeLocal());
  const [valorAtendimento, setValorAtendimento] = useState("");
  const [observacaoAtendimento, setObservacaoAtendimento] = useState("");
  const [salvandoAtendimento, setSalvandoAtendimento] = useState(false);

  function limparFormulario() {
    setNome("");
    setTelefone("");
    setEmail("");
    setEndereco("");
    setObservacoes("");
    setEditandoId(null);
  }

  async function salvar(evento) {
    evento.preventDefault();

    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
      alert("Informe o nome do cliente.");
      return;
    }

    setSalvando(true);

    try {
      const dados = {
        nome: nomeLimpo,
        telefone,
        email,
        endereco,
        observacoes,
      };

      if (editandoId) {
        await editarCliente(editandoId, dados);
      } else {
        await adicionarCliente(dados);
      }

      limparFormulario();
    } catch (erro) {
      alert(erro.message || "Não foi possível salvar o cliente.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(cliente) {
    setEditandoId(cliente.id);
    setNome(cliente.nome);
    setTelefone(cliente.telefone || "");
    setEmail(cliente.email || "");
    setEndereco(cliente.endereco || "");
    setObservacoes(cliente.observacoes || "");
  }

  async function confirmarExclusao(cliente) {
    const confirmar = window.confirm(
      `Deseja excluir o cliente "${cliente.nome}"? O histórico de atendimentos dele também será apagado.`
    );

    if (!confirmar) return;

    try {
      await removerCliente(cliente.id);

      if (editandoId === cliente.id) {
        limparFormulario();
      }
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir o cliente.");
    }
  }

  async function abrirHistorico(cliente) {
    setClienteAberto(cliente);
    setCarregandoAtendimentos(true);
    setDataAtendimento(hojeLocal());
    setValorAtendimento("");
    setObservacaoAtendimento("");

    try {
      const dados = await buscarAtendimentos(cliente.id);
      setAtendimentos(Array.isArray(dados) ? dados : []);
    } catch (erro) {
      alert(erro.message || "Não foi possível carregar o histórico.");
    } finally {
      setCarregandoAtendimentos(false);
    }
  }

  async function salvarAtendimento(evento) {
    evento.preventDefault();

    setSalvandoAtendimento(true);

    try {
      const novo = await adicionarAtendimento(clienteAberto.id, {
        data: dataAtendimento,
        // Bug real corrigido (21/08/2026): "35.000" (sem vírgula) virava
        // 35 — usa o paraNumero() do CampoValor, que sempre tira o ponto
        // de milhar primeiro, tenha vírgula ou não.
        valor: valorAtendimento === "" ? null : paraNumero(valorAtendimento),
        observacao: observacaoAtendimento,
      });

      setAtendimentos((anteriores) => [novo, ...anteriores]);
      setValorAtendimento("");
      setObservacaoAtendimento("");
    } catch (erro) {
      alert(erro.message || "Não foi possível registrar o atendimento.");
    } finally {
      setSalvandoAtendimento(false);
    }
  }

  async function excluirAtendimentoItem(atendimento) {
    const confirmar = window.confirm("Excluir esse registro do histórico?");

    if (!confirmar) return;

    try {
      await removerAtendimento(atendimento.id);
      setAtendimentos((anteriores) =>
        anteriores.filter((item) => item.id !== atendimento.id)
      );
    } catch (erro) {
      alert(erro.message || "Não foi possível excluir o registro.");
    }
  }

  const clientesFiltrados = clientes.filter((cliente) => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return true;

    return (
      cliente.nome?.toLowerCase().includes(termo) ||
      cliente.telefone?.toLowerCase().includes(termo)
    );
  });

  return (
    <section className="categorias-layout">
      {editandoId && (
      <article className="panel categoria-form-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Editar cadastro</span>
            <h2>Editar cliente</h2>
          </div>
        </div>

        <form onSubmit={salvar}>
          <label>
            Nome
            <input
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: Maria Silva"
            />
          </label>

          <label>
            Telefone / WhatsApp
            <input
              type="text"
              value={telefone}
              onChange={(evento) => setTelefone(evento.target.value)}
              placeholder="(66) 99999-9999"
            />
          </label>

          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              placeholder="cliente@exemplo.com"
            />
          </label>

          <label>
            Endereço
            <input
              type="text"
              value={endereco}
              onChange={(evento) => setEndereco(evento.target.value)}
              placeholder="Rua, número, bairro"
            />
          </label>

          <label>
            Observações
            <textarea
              value={observacoes}
              onChange={(evento) => setObservacoes(evento.target.value)}
              placeholder="Preferências, alergias, etc."
              rows="3"
            />
          </label>

          <div className="modal-actions">
            {editandoId && (
              <button
                type="button"
                className="secondary-button"
                onClick={limparFormulario}
                disabled={salvando}
              >
                Cancelar edição
              </button>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={salvando}
            >
              {salvando ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </article>
      )}

      <article className="panel categoria-lista-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Cadastros</span>
            <h2>Clientes</h2>
          </div>

          <strong>{clientes.length}</strong>
        </div>

        <input
          type="text"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="clientes-busca"
        />

        {carregando ? (
          <div className="empty-state">Carregando...</div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="empty-state">
            {clientes.length === 0
              ? "Nenhum cliente ainda. Os clientes aparecem aqui automaticamente a partir das compras (integração Saipos)."
              : "Nenhum cliente encontrado com essa busca."}
          </div>
        ) : (
          <div className="categorias-lista">
            {clientesFiltrados.map((cliente) => (
              <div className="categoria-item" key={cliente.id}>
                <div className="categoria-identificacao">
                  <div className="categoria-icone">👤</div>

                  <div>
                    <strong>{cliente.nome}</strong>
                    <div>{cliente.telefone || "Sem telefone"}</div>
                  </div>
                </div>

                <div className="transaction-actions">
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => abrirHistorico(cliente)}
                  >
                    Histórico
                  </button>

                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => iniciarEdicao(cliente)}
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => confirmarExclusao(cliente)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      {clienteAberto && (
        <div
          className="modal-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget) {
              setClienteAberto(null);
            }
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Histórico de atendimentos</span>
                <h2>{clienteAberto.nome}</h2>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={() => setClienteAberto(null)}
              >
                ×
              </button>
            </div>

            <form onSubmit={salvarAtendimento}>
              <div className="form-row">
                <label>
                  Data
                  <input
                    type="date"
                    value={dataAtendimento}
                    onChange={(evento) =>
                      setDataAtendimento(evento.target.value)
                    }
                  />
                </label>

                <label>
                  Valor gasto (opcional)
                  <CampoValor
                    value={valorAtendimento}
                    onChange={setValorAtendimento}
                  />
                </label>
              </div>

              <label>
                Observação
                <textarea
                  value={observacaoAtendimento}
                  onChange={(evento) =>
                    setObservacaoAtendimento(evento.target.value)
                  }
                  placeholder="O que o cliente pediu, preferências, etc."
                  rows="2"
                />
              </label>

              <div className="modal-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={salvandoAtendimento}
                >
                  {salvandoAtendimento
                    ? "Salvando..."
                    : "Registrar atendimento"}
                </button>
              </div>
            </form>

            <hr />

            {carregandoAtendimentos ? (
              <div className="empty-state">Carregando...</div>
            ) : atendimentos.length === 0 ? (
              <div className="empty-state">
                Nenhum atendimento registrado ainda.
              </div>
            ) : (
              <div className="categorias-lista">
                {atendimentos.map((item) => (
                  <div className="categoria-item" key={item.id}>
                    <div className="categoria-identificacao">
                      <div className="categoria-icone">📋</div>

                      <div>
                        <strong>
                          {formatarData(item.data)}
                          {item.valor
                            ? ` — ${formatarMoeda(item.valor)}`
                            : ""}
                        </strong>
                        {item.observacao && <div>{item.observacao}</div>}
                      </div>
                    </div>

                    <div className="transaction-actions">
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => excluirAtendimentoItem(item)}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default CadastroClientes;
