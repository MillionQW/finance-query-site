from .runtime import *  # noqa: F401,F403
from .common import emit_error
from .search import handle_search
from .screener import handle_screener
from .peers import handle_peers
from .statements import handle_statements
from .announcements import handle_announcements
from .etf import handle_etf_history, handle_etf_market, handle_etf_valuation
from .index import handle_index_history, handle_index_market, handle_index_valuation
from .valuation import handle_company_valuation
from .business import handle_business
from .portfolio import handle_portfolio_market


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AKShare bridge for finance-query-site")
    subparsers = parser.add_subparsers(dest="command", required=True)

    portfolio_parser = subparsers.add_parser("portfolio-market")
    portfolio_parser.add_argument("--market", choices=["a", "hk", "index", "fx"], required=True)
    portfolio_parser.add_argument("--symbol", required=True)

    business_parser = subparsers.add_parser("business-segments")
    business_parser.add_argument("--market", choices=["a", "hk"], required=True)
    business_parser.add_argument("--symbol", required=True)

    valuation_parser = subparsers.add_parser("company-valuation")
    valuation_parser.add_argument("--market", choices=["a", "hk"], required=True)
    valuation_parser.add_argument("--symbol", required=True)

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("--q", required=True)
    search_parser.add_argument("--market", choices=["all", "a", "hk"], default="all")

    statements_parser = subparsers.add_parser("statements")
    statements_parser.add_argument("--market", choices=["a", "hk"], required=True)
    statements_parser.add_argument("--symbol", required=True)
    statements_parser.add_argument("--years", type=int, default=0)

    peers_parser = subparsers.add_parser("peers")
    peers_parser.add_argument("--market", choices=["a", "hk"], required=True)
    peers_parser.add_argument("--symbol", required=True)
    peers_parser.add_argument("--limit", type=int, default=20)

    announcements_parser = subparsers.add_parser("announcements")
    announcements_parser.add_argument("--market", choices=["a", "hk"], required=True)
    announcements_parser.add_argument("--symbol", required=True)
    announcements_parser.add_argument("--days", type=int, default=60)

    screener_parser = subparsers.add_parser("screener")
    screener_parser.add_argument("--markets", default="all")
    screener_parser.add_argument("--scope", default="all")
    screener_parser.add_argument("--min-roa", type=float, default=25)
    screener_parser.add_argument("--max-pe", type=float, default=16)
    screener_parser.add_argument("--min-market-cap-billion", type=float, default=0)
    screener_parser.add_argument("--limit", type=int, default=80)
    screener_parser.add_argument("--max-candidates", type=int, default=30)
    screener_parser.add_argument("--request-gap-ms", type=int, default=1000)
    screener_parser.add_argument("--latest-period", action="store_true")
    screener_parser.add_argument("--pe-only", action="store_true")
    screener_parser.add_argument("--exclude-banks", action="store_true")

    subparsers.add_parser("etf-market")

    etf_history_parser = subparsers.add_parser("etf-history")
    etf_history_parser.add_argument("--symbol", required=True)
    etf_history_parser.add_argument("--years", type=int, default=10)
    etf_valuation_parser = subparsers.add_parser("etf-valuation")
    etf_valuation_parser.add_argument("--symbol", required=True)
    subparsers.add_parser("index-market")
    index_history_parser = subparsers.add_parser("index-history")
    index_history_parser.add_argument("--market", choices=["cn", "bj", "hk"], required=True)
    index_history_parser.add_argument("--symbol", required=True)
    index_history_parser.add_argument("--provider-symbol", required=True)
    index_history_parser.add_argument("--name", required=True)
    index_history_parser.add_argument("--years", type=int, default=10)
    index_valuation_parser = subparsers.add_parser("index-valuation")
    index_valuation_parser.add_argument("--market", choices=["cn", "bj", "hk"], required=True)
    index_valuation_parser.add_argument("--symbol", required=True)
    index_valuation_parser.add_argument("--name", required=True)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            if args.command == "portfolio-market":
                handle_portfolio_market(args)
            elif args.command == "business-segments":
                handle_business(args)
            elif args.command == "company-valuation":
                handle_company_valuation(args)
            elif args.command == "search":
                handle_search(args)
            elif args.command == "statements":
                handle_statements(args)
            elif args.command == "peers":
                handle_peers(args)
            elif args.command == "announcements":
                handle_announcements(args)
            elif args.command == "screener":
                handle_screener(args)
            elif args.command == "etf-market":
                handle_etf_market(args)
            elif args.command == "etf-history":
                handle_etf_history(args)
            elif args.command == "etf-valuation":
                handle_etf_valuation(args)
            elif args.command == "index-market":
                handle_index_market(args)
            elif args.command == "index-history":
                handle_index_history(args)
            elif args.command == "index-valuation":
                handle_index_valuation(args)
            else:
                emit_error("UNKNOWN_COMMAND", f"Unknown command: {args.command}")
    except Exception as exc:
        emit_error("AKSHARE_REQUEST_FAILED", str(exc), traceback.format_exc())
