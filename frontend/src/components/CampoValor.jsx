// Pedido do usuário (20/08/2026): em todo campo de valor do sistema,
// digitar "1000" ficava indistinguível de "100" — sem nenhum separador
// visual enquanto digita, fácil de digitar um zero a mais ou a menos sem
// perceber. Esse campo formata com ponto de milhar em tempo real (ex:
// "1.000,00"), do mesmo jeito que o valor já é mostrado depois de salvo
// — só isso, não muda em nada o formato final que cada tela já espera
// (string com vírgula decimal, ponto de milhar), então não precisa mexer
// na lógica de salvar de nenhuma tela que passar a usar esse campo.
function formatarComMilharEnquantoDigita(bruto) {
  if (!bruto) return "";

  // Só mantém dígitos e vírgula — tira letra, ponto digitado à mão, etc.
  let texto = bruto.replace(/[^\d,]/g, "");

  // Só a PRIMEIRA vírgula conta como separador decimal — qualquer outra
  // depois é descartada (evita "1,,50" ou "1,50,00").
  const primeiraVirgula = texto.indexOf(",");
  if (primeiraVirgula !== -1) {
    texto =
      texto.slice(0, primeiraVirgula + 1) +
      texto.slice(primeiraVirgula + 1).replace(/,/g, "");
  }

  const [parteInteira, parteDecimal] = texto.split(",");
  const inteiroFormatado = (parteInteira || "").replace(
    /\B(?=(\d{3})+(?!\d))/g,
    "."
  );

  return parteDecimal !== undefined
    ? `${inteiroFormatado},${parteDecimal}`
    : inteiroFormatado;
}

// Bug real corrigido (21/08/2026): "35.000,00" convertia certo, mas
// "35.000" (sem vírgula, ex: valor redondo sem centavos) caía na conta
// errada — cada tela só tirava o ponto de milhar QUANDO tinha vírgula
// junto, então "35.000" ia direto pro Number() e o JS lia o ponto como
// decimal, virando 35 em vez de 35000. Como o CampoValor sempre insere
// ponto de milhar (tenha vírgula ou não), a conversão tem que SEMPRE
// tirar os pontos primeiro, e só then trocar a vírgula (se tiver) por
// ponto decimal — nunca decidir com base em "tem vírgula ou não".
export function paraNumero(textoFormatado) {
  if (!textoFormatado && textoFormatado !== 0) return 0;

  const texto = String(textoFormatado).replace(/\./g, "").replace(",", ".");
  const numero = Number(texto);

  return Number.isNaN(numero) ? 0 : numero;
}

function CampoValor({ value, onChange, ...outrasProps }) {
  function aoDigitar(evento) {
    onChange(formatarComMilharEnquantoDigita(evento.target.value));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={aoDigitar}
      placeholder="0,00"
      {...outrasProps}
    />
  );
}

export default CampoValor;
