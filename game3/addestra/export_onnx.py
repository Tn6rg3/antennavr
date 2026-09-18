import os
import torch
from model import MorseCRNN
from dataset import VOCAB


def export_pt_to_onnx(pt_path: str, output_onnx_path: str, quantize: bool = True):
    """ Esporta il modello PyTorch (.pth) in formato ONNX per l'esecuzione in Web/WASM o ONNX Runtime. """
    try:
        device = torch.device("cpu")
        model = MorseCRNN(num_classes=len(VOCAB), fast_mode=True).to(device)

        if os.path.exists(pt_path):
            ckpt = torch.load(pt_path, map_location=device)
            state_dict = ckpt.get('model_state_dict', ckpt) if isinstance(ckpt, dict) else ckpt
            model.load_state_dict(state_dict, strict=False)

        model.eval()

        dummy_input = torch.randn(1, 1, 64, 200, device=device)
        os.makedirs(os.path.dirname(os.path.abspath(output_onnx_path)), exist_ok=True)

        torch.onnx.export(
            model,
            dummy_input,
            output_onnx_path,
            export_params=True,
            opset_version=17,
            do_constant_folding=True,
            input_names=['input_spectrogram'],
            output_names=['log_probs'],
            dynamic_axes={
                'input_spectrogram': {0: 'batch_size', 3: 'time_steps'},
                'log_probs': {0: 'time_steps', 1: 'batch_size'}
            },
            dynamo=False
        )
        print(f"✅ Modello esportato con successo in ONNX: '{output_onnx_path}' (Dimensione: {os.path.getsize(output_onnx_path)} bytes)", flush=True)

        if quantize:
            try:
                import onnxruntime.quantization as quantization
                quantized_onnx = output_onnx_path.replace('.onnx', '_quant.onnx')
                quantization.quantize_dynamic(
                    output_onnx_path,
                    quantized_onnx,
                    weight_type=quantization.QuantType.QUInt8
                )
                print(f"⚡ Modello quantizzato generato: '{quantized_onnx}' (Dimensione: {os.path.getsize(quantized_onnx)} bytes)", flush=True)
            except Exception as q_err:
                print(f"[ONNX Quantization Note]: {q_err}", flush=True)

    except Exception as e:
        print(f"[AVVISO ONNX Export]: {e}", flush=True)


if __name__ == "__main__":
    import glob
    pt_candidates = glob.glob("morse_crnn_curriculum_stage*.pth")
    if not pt_candidates:
        pt_candidates = glob.glob("backups/*.pth")

    pt_path = "morse_crnn_curriculum_stage8.pth"
    if pt_candidates:
        pt_path = sorted(pt_candidates, key=os.path.getmtime, reverse=True)[0]

    out_path = os.path.join("web", "morse_model.onnx")
    print(f"🔄 Esportazione del checkpoint '{pt_path}' in formato ONNX...", flush=True)
    export_pt_to_onnx(pt_path, out_path, quantize=True)
