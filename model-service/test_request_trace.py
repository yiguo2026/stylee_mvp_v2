from contextlib import contextmanager

from stylee.contracts import InputMode, RecommendationResult, RequestContext
from stylee.pipeline import recommend
from stylee.providers.mock import MockProvider
from stylee.rag import KeywordExemplarRetriever
from stylee.service.request_trace import RequestTrace, error_status
from stylee.service.adapter import outfits_to_app


def test_pipeline_reports_real_stage_order():
    seen: list[str] = []

    @contextmanager
    def stage(name: str):
        seen.append(name)
        yield

    result = recommend(
        RequestContext(input_mode=InputMode.NL, wardrobe=[], query_text="周末约会", n=2),
        MockProvider(),
        KeywordExemplarRetriever(),
        stage_timer=stage,
    )

    assert result.outfits
    assert seen == [
        "B0.parse_intent",
        "B1.build_candidate_pool",
        "B2.retrieve_exemplars",
        "B3.generate_outfits",
        "B4.validate_and_score",
        "B5.rank_and_diversify",
    ]


def test_request_trace_keeps_failed_stage_and_safe_summary():
    trace = RequestTrace(feature="recommend", request_id="req-test-123")

    try:
        with trace.stage("B3.generate_outfits"):
            raise TimeoutError("upstream timed out")
    except TimeoutError as error:
        summary = trace.error_summary(error)

    assert error_status(TimeoutError("upstream timed out")) == 504
    assert trace.failed_stage == "B3.generate_outfits"
    assert summary["request_id"] == "req-test-123"
    assert summary["stage"] == "B3.generate_outfits"
    assert summary["error_type"] == "TimeoutError"
    assert summary["duration_ms"] >= 0
    assert "B3.generate_outfits" in summary["stage_ms"]


def test_pipeline_timeout_is_attributed_to_b3():
    class FailingProvider(MockProvider):
        def generate_outfits(self, ctx, scene, pool, exemplars, k):
            raise TimeoutError("generation timed out")

    trace = RequestTrace(feature="recommend", request_id="req-b3-timeout")
    try:
        recommend(
            RequestContext(input_mode=InputMode.NL, wardrobe=[], query_text="周末约会", n=2),
            FailingProvider(),
            KeywordExemplarRetriever(),
            stage_timer=trace.stage,
        )
        assert False, "应抛 TimeoutError"
    except TimeoutError:
        pass

    assert trace.failed_stage == "B3.generate_outfits"


def test_adapter_trace_layout_contract_values_are_integer_counts():
    body = outfits_to_app(
        RecommendationResult(outfits=[]),
        RequestContext(input_mode=InputMode.NL, wardrobe=[]),
    )

    assert isinstance(body["trace"]["layout_items_emitted"], int)
    assert isinstance(body["trace"]["layout_contract_build_error_count"], int)


def main():
    test_pipeline_reports_real_stage_order()
    test_request_trace_keeps_failed_stage_and_safe_summary()
    test_pipeline_timeout_is_attributed_to_b3()
    test_adapter_trace_layout_contract_values_are_integer_counts()
    print("ok")


if __name__ == "__main__":
    main()
