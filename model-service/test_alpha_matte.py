import base64
import io
import struct
import warnings
import zlib
from PIL import Image, ImageDraw
from stylee.vision.alpha_matte import AlphaMatteError, matte_image_bytes, read_image_ref, validate_alpha_png
import stylee.vision.alpha_matte as matte

def fixture_png(background=(255, 255, 255), white_center=False):
    image = Image.new("RGB", (100, 100), background)
    draw = ImageDraw.Draw(image)
    draw.rectangle((25, 20, 75, 80), fill=(25, 40, 55))
    if white_center:
        draw.rectangle((40, 35, 60, 65), fill=(255, 255, 255))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()

def fixture_png_header(width, height):
    raw = bytearray(fixture_png())
    raw[16:24] = struct.pack(">II", width, height)
    raw[29:33] = struct.pack(">I", zlib.crc32(raw[12:29]))
    return bytes(raw)

def test_connected_border_is_transparent_but_internal_white_survives():
    result = matte_image_bytes(fixture_png(white_center=True))
    png = base64.b64decode(result.data_uri.split(",", 1)[1])
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    assert image.getpixel((0, 0))[3] <= 16
    assert image.getpixel((50, 50))[3] >= 32
    assert result.alpha_verified is True

def test_off_white_canvas_fails_validation():
    try:
        matte_image_bytes(fixture_png((220, 220, 220)))
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.alpha_validate"

def test_data_uri_round_trip():
    raw = fixture_png()
    ref = "data:image/png;base64," + base64.b64encode(raw).decode()
    assert read_image_ref(ref) == raw
    stats = validate_alpha_png(base64.b64decode(matte_image_bytes(raw).data_uri.split(",", 1)[1]))
    assert stats.transparent_ratio >= 0.05
    assert stats.visible_ratio >= 0.05
    assert stats.transparent_border_ratio >= 0.90

def test_exact_input_limits_fail_closed():
    import stylee.vision.alpha_matte as matte
    oversized = base64.b64encode(b"x" * (matte.MAX_INPUT_BYTES + 1)).decode()
    try:
        read_image_ref("data:image/png;base64," + oversized)
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"

    original_limit = matte.MAX_OUTPUT_BYTES
    matte.MAX_OUTPUT_BYTES = 1
    try:
        matte_image_bytes(fixture_png())
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.png_encode"
    finally:
        matte.MAX_OUTPUT_BYTES = original_limit

    large = Image.new("RGB", (4001, 4000), (255, 255, 255))
    out = io.BytesIO()
    large.save(out, format="PNG")
    try:
        matte_image_bytes(out.getvalue())
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"

def test_pillow_decompression_bomb_error_is_source_error():
    try:
        matte_image_bytes(fixture_png_header(20_000, 20_000))
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"

def test_pillow_decompression_bomb_warning_is_source_error():
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            matte_image_bytes(fixture_png_header(10_000, 10_000))
            assert False
        except AlphaMatteError as error:
            assert error.stage == "A2.source_image_download"

def _provider_response(status=200, headers=None, body=b""):
    return matte.ProviderHttpResponse(status=status, headers=headers or {}, body=body)

def _assert_provider_ref_rejected(ref, resolved_ips, allowed_hosts):
    transport_calls = []
    try:
        matte.read_provider_image_ref(
            ref,
            allowed_hosts=allowed_hosts,
            resolver=lambda host, port: resolved_ips,
            transport=lambda url, connect_ip, timeout: transport_calls.append(
                (url, connect_ip, timeout)
            ),
        )
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"
    assert transport_calls == []

def test_client_http_reference_never_reaches_network():
    original_getaddrinfo = matte.socket.getaddrinfo
    calls = []
    matte.socket.getaddrinfo = lambda *args, **kwargs: calls.append((args, kwargs))
    try:
        try:
            read_image_ref("https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/out.png")
            assert False
        except AlphaMatteError as error:
            assert error.stage == "A2.source_image_download"
    finally:
        matte.socket.getaddrinfo = original_getaddrinfo
    assert calls == []

def test_provider_url_rejects_loopback_and_non_https():
    _assert_provider_ref_rejected(
        "https://127.0.0.1/out.png", ["127.0.0.1"], ("127.0.0.1",),
    )
    _assert_provider_ref_rejected(
        "http://provider.test/out.png", ["93.184.216.34"], ("provider.test",),
    )

def test_provider_url_rejects_rfc1918_and_link_local_ipv4():
    for host in ("10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254"):
        _assert_provider_ref_rejected(
            f"https://{host}/out.png", [host], (host,),
        )

def test_provider_url_rejects_ipv6_loopback_private_and_link_local():
    for host in ("::1", "fd00::1", "fe80::1"):
        _assert_provider_ref_rejected(
            f"https://[{host}]/out.png", [host], (host,),
        )

def test_provider_url_rejects_userinfo_and_disallowed_hosts():
    _assert_provider_ref_rejected(
        "https://user:password@provider.test/out.png",
        ["93.184.216.34"],
        ("provider.test",),
    )
    _assert_provider_ref_rejected(
        "https://disallowed.test/out.png",
        ["93.184.216.34"],
        ("provider.test",),
    )

def test_provider_redirect_to_private_target_is_rejected():
    calls = []

    def resolver(host, port):
        return ["93.184.216.34"] if host == "provider.test" else ["10.0.0.8"]

    def transport(url, connect_ip, timeout):
        calls.append((url, connect_ip))
        return _provider_response(302, {"Location": "https://private.test/out.png"})

    try:
        matte.read_provider_image_ref(
            "https://provider.test/start.png",
            allowed_hosts=("provider.test", "private.test"),
            resolver=resolver,
            transport=transport,
        )
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"
    assert calls == [("https://provider.test/start.png", "93.184.216.34")]

def test_provider_url_rejects_mixed_public_private_dns_answers():
    _assert_provider_ref_rejected(
        "https://provider.test/out.png",
        ["93.184.216.34", "10.0.0.9"],
        ("provider.test",),
    )

def test_allowed_provider_url_pins_the_validated_public_connection_target():
    raw = fixture_png()
    calls = []
    provider_url = "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/out.png"

    def transport(url, connect_ip, timeout):
        calls.append((url, connect_ip, timeout))
        return _provider_response(200, {"Content-Length": str(len(raw))}, raw)

    result = matte.read_provider_image_ref(
        provider_url,
        timeout_seconds=7,
        allowed_hosts=(),
        resolver=lambda host, port: ["93.184.216.34"],
        transport=transport,
    )
    assert result == raw
    assert calls == [(provider_url, "93.184.216.34", 7)]

def test_current_dashscope_shanghai_provider_url_is_allowed():
    raw = fixture_png()
    provider_url = "https://dashscope-7c2c.oss-cn-shanghai.aliyuncs.com/out.png"

    result = matte.read_provider_image_ref(
        provider_url,
        allowed_hosts=(),
        resolver=lambda host, port: ["93.184.216.34"],
        transport=lambda url, connect_ip, timeout: _provider_response(
            200, {"Content-Length": str(len(raw))}, raw,
        ),
    )

    assert result == raw

def test_dashscope_host_allowlist_does_not_trust_arbitrary_oss_buckets():
    for host in (
        "attacker.oss-cn-shanghai.aliyuncs.com",
        "dashscope-7c2c.oss-cn-shanghai.aliyuncs.com.evil.example",
    ):
        _assert_provider_ref_rejected(
            f"https://{host}/out.png",
            ["93.184.216.34"],
            (),
        )

def test_provider_remote_read_preserves_input_size_bound():
    try:
        matte.read_provider_image_ref(
            "https://provider.test/out.png",
            allowed_hosts=("provider.test",),
            resolver=lambda host, port: ["93.184.216.34"],
            transport=lambda url, connect_ip, timeout: _provider_response(
                200, {"Content-Length": str(matte.MAX_INPUT_BYTES + 1)}, b"",
            ),
        )
        assert False
    except AlphaMatteError as error:
        assert error.stage == "A2.source_image_download"

def main():
    test_connected_border_is_transparent_but_internal_white_survives()
    test_off_white_canvas_fails_validation()
    test_data_uri_round_trip()
    test_exact_input_limits_fail_closed()
    test_pillow_decompression_bomb_error_is_source_error()
    test_pillow_decompression_bomb_warning_is_source_error()
    test_client_http_reference_never_reaches_network()
    test_provider_url_rejects_loopback_and_non_https()
    test_provider_url_rejects_rfc1918_and_link_local_ipv4()
    test_provider_url_rejects_ipv6_loopback_private_and_link_local()
    test_provider_url_rejects_userinfo_and_disallowed_hosts()
    test_provider_redirect_to_private_target_is_rejected()
    test_provider_url_rejects_mixed_public_private_dns_answers()
    test_allowed_provider_url_pins_the_validated_public_connection_target()
    test_current_dashscope_shanghai_provider_url_is_allowed()
    test_dashscope_host_allowlist_does_not_trust_arbitrary_oss_buckets()
    test_provider_remote_read_preserves_input_size_bound()
    print("ok")

if __name__ == "__main__":
    main()
