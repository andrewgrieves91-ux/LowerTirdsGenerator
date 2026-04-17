{
  "targets": [
    {
      "target_name": "ndi_sender",
      "sources": [ "src/sender.cc" ],
      "include_dirs": [ "include", "<!(node -p \"require('node-addon-api').include_dir\")" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": [ "-include", "cstddef", "-std=c++17", "-Wno-error" ],
            "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
            "GCC_ENABLE_CPP_RTTI": "NO",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          },
          "link_settings": {
            "libraries": [
              "-Llib/macOS",
              "-lndi",
              "-Wl,-rpath,@loader_path"
            ]
          },
          "copies": [
            {
              "destination": "build/Release",
              "files": [ "lib/macOS/libndi.dylib" ]
            }
          ]
        }]
      ]
    }
  ]
}
