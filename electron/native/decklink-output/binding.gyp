{
  "targets": [
    {
      "target_name": "decklink_output",
      "sources": [
        "src/decklink_output.mm",
        "include/DeckLinkAPIDispatch.cpp"
      ],
      "include_dirs": [
        "include",
        "<!(node -p \"require('node-addon-api').include_dir\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": [ "-include", "cstddef", "-std=c++17", "-Wno-error", "-Wno-multichar" ],
            "OTHER_CFLAGS": [ "-Wno-multichar" ],
            "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
            "GCC_ENABLE_CPP_RTTI": "NO",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          },
          "link_settings": {
            "libraries": [
              "-framework CoreFoundation"
            ]
          }
        }]
      ]
    }
  ]
}
