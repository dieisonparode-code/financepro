import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function entrar(evento) {
    evento.preventDefault();
    setErro("");
    setCarregando(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    });

    if (error) {
      setErro("E-mail ou senha inválidos.");
      setCarregando(false);
      return;
    }

    login(data.session);
    navigate("/", { replace: true });
  }

  return (
    <>
      <style>{`
        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          width: 100%;
          min-width: 100%;
          min-height: 100%;
          margin: 0;
        }

        body {
          overflow-x: hidden;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .login-page {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          min-height: 680px;
          overflow: auto;
          color: #ffffff;
          background:
            radial-gradient(
              circle at 12% 15%,
              rgba(37, 99, 235, 0.38),
              transparent 31%
            ),
            radial-gradient(
              circle at 90% 10%,
              rgba(6, 182, 212, 0.23),
              transparent 29%
            ),
            radial-gradient(
              circle at 72% 88%,
              rgba(124, 58, 237, 0.18),
              transparent 30%
            ),
            linear-gradient(
              135deg,
              #030712 0%,
              #071326 38%,
              #0a1730 67%,
              #040914 100%
            );
        }

        .login-page::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.17;
          background-image:
            linear-gradient(
              rgba(255, 255, 255, 0.07) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.07) 1px,
              transparent 1px
            );
          background-size: 58px 58px;
          mask-image: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.9),
            transparent
          );
        }

        .login-page::after {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(
              90deg,
              rgba(2, 6, 23, 0.12),
              transparent 28%,
              transparent 72%,
              rgba(2, 6, 23, 0.2)
            );
        }

        .login-orb {
          position: fixed;
          border-radius: 999px;
          filter: blur(20px);
          pointer-events: none;
          animation: orbFloat 9s ease-in-out infinite;
        }

        .login-orb-one {
          top: -130px;
          right: 25%;
          width: 390px;
          height: 390px;
          background: rgba(37, 99, 235, 0.16);
        }

        .login-orb-two {
          bottom: -160px;
          left: 13%;
          width: 430px;
          height: 430px;
          background: rgba(14, 165, 233, 0.11);
          animation-delay: -4s;
        }

        .login-container {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: minmax(0, 1.18fr) minmax(460px, 0.82fr);
          width: 100%;
          min-height: 100vh;
        }

        .login-presentation {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: clamp(40px, 5vw, 82px);
          overflow: hidden;
          border-right: 1px solid rgba(148, 163, 184, 0.13);
        }

        .login-brand {
          display: flex;
          align-items: center;
          gap: 15px;
          animation: loginReveal 0.65s ease both;
        }

        .login-brand-symbol {
          position: relative;
          display: grid;
          place-items: center;
          width: 55px;
          height: 55px;
          overflow: hidden;
          border: 1px solid rgba(125, 211, 252, 0.35);
          border-radius: 17px;
          color: #ffffff;
          font-size: 17px;
          font-weight: 900;
          letter-spacing: -0.5px;
          background:
            linear-gradient(
              145deg,
              rgba(37, 99, 235, 1),
              rgba(8, 145, 178, 0.95)
            );
          box-shadow:
            0 22px 55px rgba(37, 99, 235, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.28);
        }

        .login-brand-symbol::after {
          content: "";
          position: absolute;
          width: 34px;
          height: 90px;
          transform: rotate(35deg);
          background: rgba(255, 255, 255, 0.16);
          animation: logoShine 5s ease-in-out infinite;
        }

        .login-brand-name {
          margin: 0;
          font-size: 23px;
          font-weight: 850;
          letter-spacing: -0.65px;
        }

        .login-brand-description {
          display: block;
          margin-top: 3px;
          color: #8fa5c1;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.25px;
        }

        .login-hero {
          width: 100%;
          max-width: 760px;
          margin: 72px 0 62px;
          animation: loginReveal 0.75s 0.08s ease both;
        }

        .login-badge {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 9px 13px;
          margin-bottom: 27px;
          border: 1px solid rgba(125, 211, 252, 0.21);
          border-radius: 999px;
          color: #8ee7ff;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          background: rgba(14, 165, 233, 0.08);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .login-badge-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22d3ee;
          box-shadow: 0 0 14px rgba(34, 211, 238, 0.95);
        }

        .login-title {
          max-width: 760px;
          margin: 0;
          font-size: clamp(43px, 5.2vw, 77px);
          line-height: 0.99;
          font-weight: 860;
          letter-spacing: clamp(-4px, -0.25vw, -2px);
        }

        .login-title-gradient {
          display: block;
          color: transparent;
          background:
            linear-gradient(
              90deg,
              #ffffff 0%,
              #bfdbfe 45%,
              #67e8f9 100%
            );
          background-clip: text;
          -webkit-background-clip: text;
        }

        .login-description {
          max-width: 650px;
          margin: 28px 0 0;
          color: #9eb0c8;
          font-size: clamp(16px, 1.3vw, 19px);
          line-height: 1.75;
        }

        .login-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 15px;
          width: 100%;
          max-width: 760px;
          animation: loginReveal 0.8s 0.15s ease both;
        }

        .login-metric {
          min-height: 125px;
          padding: 20px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 19px;
          background:
            linear-gradient(
              145deg,
              rgba(255, 255, 255, 0.07),
              rgba(255, 255, 255, 0.022)
            );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.07),
            0 18px 48px rgba(2, 6, 23, 0.2);
          backdrop-filter: blur(16px);
          transition:
            transform 0.25s ease,
            border-color 0.25s ease,
            background 0.25s ease;
        }

        .login-metric:hover {
          transform: translateY(-5px);
          border-color: rgba(96, 165, 250, 0.3);
          background:
            linear-gradient(
              145deg,
              rgba(37, 99, 235, 0.13),
              rgba(255, 255, 255, 0.035)
            );
        }

        .login-metric-icon {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          margin-bottom: 15px;
          border-radius: 10px;
          color: #bae6fd;
          background: rgba(37, 99, 235, 0.18);
          border: 1px solid rgba(96, 165, 250, 0.18);
        }

        .login-metric-title {
          display: block;
          margin-bottom: 5px;
          color: #f8fafc;
          font-size: 14px;
          font-weight: 760;
        }

        .login-metric-text {
          color: #8497b1;
          font-size: 12px;
          line-height: 1.5;
        }

        .login-access-area {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(32px, 5vw, 85px);
          background:
            radial-gradient(
              circle at 65% 18%,
              rgba(37, 99, 235, 0.16),
              transparent 34%
            ),
            linear-gradient(
              155deg,
              rgba(15, 23, 42, 0.63),
              rgba(2, 6, 23, 0.92)
            );
        }

        .login-access-area::before {
          content: "";
          position: absolute;
          inset: 8%;
          pointer-events: none;
          border: 1px solid rgba(148, 163, 184, 0.07);
          border-radius: 36px;
        }

        .login-form-card {
          position: relative;
          z-index: 3;
          width: 100%;
          max-width: 490px;
          padding: clamp(31px, 4vw, 47px);
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 28px;
          background:
            linear-gradient(
              145deg,
              rgba(30, 41, 59, 0.86),
              rgba(15, 23, 42, 0.76)
            );
          box-shadow:
            0 38px 110px rgba(0, 0, 0, 0.48),
            inset 0 1px 0 rgba(255, 255, 255, 0.09);
          backdrop-filter: blur(30px);
          animation: cardReveal 0.78s 0.12s ease both;
        }

        .login-form-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 12%;
          width: 76%;
          height: 1px;
          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(125, 211, 252, 0.8),
              transparent
            );
        }

        .login-security {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 21px;
          color: #7dd3fc;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.6px;
          text-transform: uppercase;
        }

        .login-form-title {
          margin: 0;
          color: #f8fafc;
          font-size: clamp(30px, 3vw, 40px);
          line-height: 1.12;
          font-weight: 850;
          letter-spacing: -1.4px;
        }

        .login-form-subtitle {
          margin: 12px 0 31px;
          color: #93a4bb;
          font-size: 14px;
          line-height: 1.65;
        }

        .login-label {
          display: block;
          margin-bottom: 9px;
          color: #dce7f5;
          font-size: 13px;
          font-weight: 720;
        }

        .login-input-wrapper {
          position: relative;
          margin-bottom: 21px;
        }

        .login-input-icon {
          position: absolute;
          top: 50%;
          left: 16px;
          display: grid;
          place-items: center;
          transform: translateY(-50%);
          color: #6f87a7;
          pointer-events: none;
        }

        .login-input {
          width: 100%;
          height: 57px;
          padding: 0 49px;
          border: 1px solid rgba(148, 163, 184, 0.21);
          border-radius: 14px;
          outline: none;
          color: #f8fafc;
          font-size: 14px;
          background: rgba(2, 6, 23, 0.42);
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
          transition:
            border-color 0.22s ease,
            background 0.22s ease,
            box-shadow 0.22s ease,
            transform 0.22s ease;
        }

        .login-input::placeholder {
          color: #61728b;
        }

        .login-input:focus {
          border-color: rgba(56, 189, 248, 0.72);
          background: rgba(3, 15, 34, 0.75);
          box-shadow:
            0 0 0 4px rgba(14, 165, 233, 0.1),
            0 12px 35px rgba(2, 132, 199, 0.1);
          transform: translateY(-1px);
        }

        .login-show-password {
          position: absolute;
          top: 50%;
          right: 14px;
          display: grid;
          place-items: center;
          width: 33px;
          height: 33px;
          padding: 0;
          transform: translateY(-50%);
          border: none;
          border-radius: 9px;
          color: #7186a3;
          cursor: pointer;
          background: transparent;
          transition:
            color 0.2s ease,
            background 0.2s ease;
        }

        .login-show-password:hover {
          color: #bae6fd;
          background: rgba(56, 189, 248, 0.09);
        }

        .login-error {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 14px;
          margin: -4px 0 19px;
          border: 1px solid rgba(248, 113, 113, 0.25);
          border-radius: 12px;
          color: #fecaca;
          font-size: 13px;
          font-weight: 650;
          background: rgba(127, 29, 29, 0.22);
          animation: errorShake 0.35s ease;
        }

        .login-button {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          height: 58px;
          overflow: hidden;
          border: none;
          border-radius: 14px;
          color: #ffffff;
          font-size: 14px;
          font-weight: 820;
          letter-spacing: 0.15px;
          cursor: pointer;
          background:
            linear-gradient(
              115deg,
              #2563eb 0%,
              #0284c7 53%,
              #06b6d4 100%
            );
          box-shadow:
            0 20px 38px rgba(2, 132, 199, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.28);
          transition:
            transform 0.22s ease,
            box-shadow 0.22s ease,
            filter 0.22s ease;
        }

        .login-button::before {
          content: "";
          position: absolute;
          top: -100%;
          left: -20%;
          width: 28%;
          height: 300%;
          transform: rotate(25deg);
          background: rgba(255, 255, 255, 0.18);
          transition: left 0.55s ease;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-3px);
          filter: brightness(1.08);
          box-shadow:
            0 25px 50px rgba(2, 132, 199, 0.38),
            inset 0 1px 0 rgba(255, 255, 255, 0.34);
        }

        .login-button:hover::before {
          left: 112%;
        }

        .login-button:active:not(:disabled) {
          transform: translateY(-1px);
        }

        .login-button:disabled {
          cursor: wait;
          opacity: 0.75;
        }

        .login-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: loginSpin 0.75s linear infinite;
        }

        .login-trust {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding-top: 23px;
          margin-top: 26px;
          border-top: 1px solid rgba(148, 163, 184, 0.13);
          color: #64748b;
          font-size: 11px;
          line-height: 1.5;
          text-align: center;
        }

        .login-version {
          position: absolute;
          right: 25px;
          bottom: 20px;
          color: rgba(148, 163, 184, 0.45);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.6px;
        }

        @keyframes loginReveal {
          from {
            opacity: 0;
            transform: translateY(20px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes cardReveal {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.975);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes orbFloat {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }

          50% {
            transform: translate3d(18px, 24px, 0);
          }
        }

        @keyframes logoShine {
          0%,
          70% {
            left: -70px;
          }

          100% {
            left: 100px;
          }
        }

        @keyframes loginSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes errorShake {
          0%,
          100% {
            transform: translateX(0);
          }

          35% {
            transform: translateX(-5px);
          }

          70% {
            transform: translateX(5px);
          }
        }

        @media (max-width: 1050px) {
          .login-container {
            grid-template-columns: 1fr;
          }

          .login-presentation {
            min-height: auto;
            padding-bottom: 42px;
            border-right: none;
            border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          }

          .login-hero {
            margin: 54px 0 45px;
          }

          .login-access-area {
            min-height: 720px;
          }

          .login-access-area::before {
            display: none;
          }
        }

        @media (max-width: 700px) {
          .login-page {
            position: relative;
            min-height: 100vh;
            height: auto;
          }

          .login-presentation {
            padding: 30px 22px 35px;
          }

          .login-title {
            font-size: 42px;
            letter-spacing: -2.5px;
          }

          .login-description {
            font-size: 15px;
          }

          .login-metrics {
            grid-template-columns: 1fr;
          }

          .login-metric {
            min-height: auto;
          }

          .login-access-area {
            min-height: auto;
            padding: 38px 18px 70px;
          }

          .login-form-card {
            padding: 29px 22px;
            border-radius: 22px;
          }

          .login-version {
            display: none;
          }
        }
      `}</style>

      <div className="login-page">
        <div className="login-orb login-orb-one" />
        <div className="login-orb login-orb-two" />

        <div className="login-container">
          <section className="login-presentation">
            <header className="login-brand">
              <div className="login-brand-symbol">FP</div>

              <div>
                <h2 className="login-brand-name">FinancePro</h2>
                <span className="login-brand-description">
                  Inteligência financeira empresarial
                </span>
              </div>
            </header>

            <main className="login-hero">
              <div className="login-badge">
                <span className="login-badge-dot" />
                Gestão orientada por dados
              </div>

              <h1 className="login-title">
                Controle financeiro
                <span className="login-title-gradient">
                  em nível estratégico.
                </span>
              </h1>

              <p className="login-description">
                Transforme dados operacionais em decisões seguras. Acompanhe
                receitas, despesas, margem, fluxo de caixa e CMV em uma visão
                executiva centralizada.
              </p>
            </main>

            <div className="login-metrics">
              <article className="login-metric">
                <div className="login-metric-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 19V9" />
                    <path d="M10 19V5" />
                    <path d="M16 19v-7" />
                    <path d="M22 19H2" />
                  </svg>
                </div>

                <strong className="login-metric-title">
                  Visão executiva
                </strong>

                <span className="login-metric-text">
                  Indicadores essenciais consolidados em tempo real.
                </span>
              </article>

              <article className="login-metric">
                <div className="login-metric-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 12h4l3-8 4 16 3-8h4" />
                  </svg>
                </div>

                <strong className="login-metric-title">
                  Controle de performance
                </strong>

                <span className="login-metric-text">
                  Margem, resultado e CMV acompanhados de forma contínua.
                </span>
              </article>

              <article className="login-metric">
                <div className="login-metric-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>

                <strong className="login-metric-title">
                  Ambiente protegido
                </strong>

                <span className="login-metric-text">
                  Controle de acesso estruturado para usuários autorizados.
                </span>
              </article>
            </div>
          </section>

          <section className="login-access-area">
            <form className="login-form-card" onSubmit={entrar}>
              <div className="login-security">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect width="18" height="11" x="3" y="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>

                Ambiente seguro
              </div>

              <h2 className="login-form-title">
                Bem-vindo ao FinancePro
              </h2>

              <p className="login-form-subtitle">
                Identifique-se para acessar o painel financeiro e os recursos
                de gestão.
              </p>

              <label className="login-label" htmlFor="email">
                E-mail corporativo
              </label>

              <div className="login-input-wrapper">
                <span className="login-input-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-10 6L2 7" />
                  </svg>
                </span>

                <input
                  id="email"
                  className="login-input"
                  type="email"
                  placeholder="nome@empresa.com"
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <label className="login-label" htmlFor="senha">
                Senha de acesso
              </label>

              <div className="login-input-wrapper">
                <span className="login-input-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>

                <input
                  id="senha"
                  className="login-input"
                  type={mostrarSenha ? "text" : "password"}
                  placeholder="Digite sua senha"
                  value={senha}
                  onChange={(evento) => setSenha(evento.target.value)}
                  autoComplete="current-password"
                  required
                />

                <button
                  className="login-show-password"
                  type="button"
                  onClick={() => setMostrarSenha((valor) => !valor)}
                  aria-label={
                    mostrarSenha ? "Ocultar senha" : "Mostrar senha"
                  }
                >
                  {mostrarSenha ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m2 2 20 20" />
                      <path d="M6.7 6.7C4.7 8.1 3.2 10 2 12c2.3 4 5.7 6 10 6 1.2 0 2.3-.2 3.3-.5" />
                      <path d="M10.7 10.7a2 2 0 0 0 2.6 2.6" />
                      <path d="M14.2 5.2A11 11 0 0 0 12 5c-4.3 0-7.7 2-10 6" />
                      <path d="M18.5 8.5A13.5 13.5 0 0 1 22 12a12.8 12.8 0 0 1-2.2 3" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              {erro && (
                <div className="login-error">
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4" />
                    <path d="M12 16h.01" />
                  </svg>

                  {erro}
                </div>
              )}

              <button
                className="login-button"
                type="submit"
                disabled={carregando}
              >
                {carregando ? (
                  <>
                    <span className="login-spinner" />
                    Validando acesso...
                  </>
                ) : (
                  <>
                    Acessar painel financeiro

                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </>
                )}
              </button>

              <div className="login-trust">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                </svg>

                Acesso restrito e monitorado para proteção das informações.
              </div>
            </form>

            <span className="login-version">
              FINANCEPRO • AMBIENTE EMPRESARIAL
            </span>
          </section>
        </div>
      </div>
    </>
  );
}