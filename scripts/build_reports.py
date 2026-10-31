#!/usr/bin/env python3
"""Genera el Excel maestro de pedidos a partir del JSON que produce lib/reports.js."""

import json
import os
import sys
from datetime import datetime

import xlsxwriter


def money(cents):
    try:
        return round((int(cents) or 0) / 100, 2)
    except (TypeError, ValueError):
        return 0.0


def qty(value):
    try:
        return int(value) or 0
    except (TypeError, ValueError):
        return 0


def excel_datetime(value):
    text = str(value or "").strip().replace("T", " ")
    if not text:
        return ""
    try:
        return datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return text


def sheet_name(name):
    clean = "".join(ch for ch in str(name) if ch not in "[]:*?/\\")
    return clean[:31] or "Hoja"


def load_data(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def make_formats(workbook):
    return {
        "title": workbook.add_format({"bold": True, "font_size": 18, "font_color": "#14324F"}),
        "subtitle": workbook.add_format({"italic": True, "font_size": 10, "font_color": "#5B6B7A"}),
        "section": workbook.add_format({"bold": True, "font_size": 12, "font_color": "#14324F"}),
        "header": workbook.add_format({
            "bold": True, "font_color": "#FFFFFF", "bg_color": "#1F4E78",
            "border": 1, "border_color": "#D9E2EC", "align": "center", "valign": "vcenter", "text_wrap": True,
        }),
        "text": workbook.add_format({"border": 1, "border_color": "#E2E8F0", "valign": "vcenter"}),
        "center": workbook.add_format({"border": 1, "border_color": "#E2E8F0", "align": "center", "valign": "vcenter"}),
        "money": workbook.add_format({"border": 1, "border_color": "#E2E8F0", "num_format": "#,##0.00", "valign": "vcenter"}),
        "integer": workbook.add_format({"border": 1, "border_color": "#E2E8F0", "num_format": "#,##0", "align": "center", "valign": "vcenter"}),
        "date": workbook.add_format({"border": 1, "border_color": "#E2E8F0", "num_format": "dd/mm/yyyy hh:mm", "valign": "vcenter"}),
        "note": workbook.add_format({"italic": True, "font_color": "#7A5B00", "bg_color": "#FFF4CC", "border": 1, "border_color": "#F2D98D", "text_wrap": True}),
        "paid": workbook.add_format({"bg_color": "#E6F4EA", "font_color": "#0B5F0B", "bold": True, "border": 1, "border_color": "#B7DFC0"}),
        "pending": workbook.add_format({"bg_color": "#FFF4CC", "font_color": "#7A5100", "bold": True, "border": 1, "border_color": "#F2D98D"}),
        "refunded": workbook.add_format({"bg_color": "#FDE8E8", "font_color": "#9B1C1C", "bold": True, "border": 1, "border_color": "#F3C4BE"}),
        "refunded_row": workbook.add_format({"bg_color": "#FFF1F0"}),
        "negative": workbook.add_format({"font_color": "#9B1C1C", "bold": True}),
    }


def write_table(ws, formats, headers, rows, start_row=0, widths=None, col_formats=None, autofilter=True):
    for col, header in enumerate(headers):
        ws.write(start_row, col, header, formats["header"])
    for offset, row in enumerate(rows, start=1):
        for col, value in enumerate(row):
            fmt = (col_formats or [None] * len(headers))[col]
            if value is None:
                value = ""
            ws.write(start_row + offset, col, value, fmt)
    if widths:
        for col, width in enumerate(widths):
            ws.set_column(col, col, width)
    ws.freeze_panes(start_row + 1, 0)
    if rows and autofilter:
        ws.autofilter(start_row, 0, start_row + len(rows), len(headers) - 1)
    return start_row + len(rows)


def add_chart(ws, workbook, kind, title, categories, values, series_name, anchor, size=(600, 320), y2=None):
    if not values:
        return
    chart = workbook.add_chart({"type": kind})
    chart.add_series({
        "name": series_name,
        "categories": categories,
        "values": values,
        "fill": {"color": "#2F80ED"},
        "border": {"color": "#2F80ED"},
    })
    if y2:
        chart.add_series({
            "name": y2[0],
            "categories": categories,
            "values": y2[1],
            "y2_axis": True,
            "fill": {"color": "#F2994A"},
            "border": {"color": "#F2994A"},
        })
        chart.set_y2_axis({"name": "Pedidos"})
    chart.set_title({"name": title, "name_font": {"size": 12}})
    chart.set_legend({"position": "bottom"})
    chart.set_size({"width": size[0], "height": size[1]})
    chart.set_chartarea({"border": {"none": True}})
    chart.set_plotarea({"border": {"none": True}, "fill": {"color": "#F8FAFC"}})
    ws.insert_chart(anchor, chart)


def period_rows(data, key, currency):
    rows = [row for row in (data.get("periods") or {}).get(key, []) if row.get("currency") == currency]
    if not rows:
        rows = (data.get("periods") or {}).get(key, [])
    return sorted(rows, key=lambda row: str(row.get("period_key", "")))


def add_period_sheet(workbook, formats, data, key, title, currency, chart_kind):
    ws = workbook.add_worksheet(sheet_name(title))
    rows = period_rows(data, key, currency)
    headers = ["Periodo", "Moneda", "Pedidos", "Unidades", "Ingresos", "Pagos", "Reembolsos", "Anulaciones", "Ticket medio"]
    values = []
    for row in rows:
        values.append([
            row.get("label", ""),
            row.get("currency", ""),
            qty(row.get("orders")),
            qty(row.get("units")),
            money(row.get("income_cents")),
            money(row.get("payments_cents")),
            money(row.get("refund_cents")),
            money(row.get("adjustments_cents")),
            money(row.get("ticket_cents")),
        ])
    write_table(
        ws, formats, headers, values,
        widths=[18, 9, 10, 10, 14, 14, 14, 14, 14],
        col_formats=[formats["text"], formats["center"], formats["integer"], formats["integer"],
                     formats["money"], formats["money"], formats["money"], formats["money"], formats["money"]],
    )
    ws.write(0, 9, "Los importes están en la moneda indicada en cada fila.", formats["subtitle"])
    if values and len(values) >= 1:
        end = len(values) + 1
        cats = f"='{ws.get_name()}'!$A$2:$A${end}"
        add_chart(
            ws, workbook, chart_kind, f"{title}: ingresos y pagos",
            cats, f"='{ws.get_name()}'!$E$2:$E${end}", "Ingresos",
            "J2", y2=("Pedidos", f"='{ws.get_name()}'!$C$2:$C${end}"),
        )
    else:
        ws.write(1, 0, "Todavía no hay ventas pagadas para este período.", formats["note"])
    return ws


def build(data, output_path):
    workbook = xlsxwriter.Workbook(output_path, {"nan_inf_to_errors": True})
    formats = make_formats(workbook)
    primary = (data.get("currency") or {}).get("code") or "CUC"
    summary_rows = data.get("summary_by_currency") or [data.get("summary") or {}]
    all_orders = data.get("all_orders") or data.get("orders") or []

    # Resumen
    ws = workbook.add_worksheet("Resumen")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 18)
    ws.set_column("B:B", 14)
    ws.set_column("C:C", 14)
    ws.set_column("D:D", 14)
    ws.set_column("E:E", 14)
    ws.set_column("F:F", 10)
    ws.set_column("G:G", 10)
    ws.set_column("H:H", 14)
    ws.set_column("I:I", 24)
    ws.write("A1", (data.get("business") or {}).get("name") or "Lily's Plays", formats["title"])
    ws.write("A2", (data.get("business") or {}).get("subtitle") or "Salón Gamer y Bistró", formats["subtitle"])
    ws.write("A3", f"Generado: {data.get('generated_at', '')}", formats["subtitle"])
    if data.get("mixed_currencies"):
        ws.merge_range("A4:I4", "Hay pedidos en más de una moneda. Los totales se muestran separados por moneda.", formats["note"])
        start = 5
    else:
        start = 4
    ws.write(start, 0, "Resumen por moneda", formats["section"])
    headers = ["Moneda", "Ingresos", "Pagos", "Reembolsos", "Anulaciones", "Pedidos", "Unidades", "Ticket medio", "Producto más vendido"]
    values = []
    for row in summary_rows:
        values.append([
            row.get("currency", ""),
            money(row.get("income_cents")),
            money(row.get("payments_cents")),
            money(row.get("refund_cents")),
            money(row.get("adjustments_cents")),
            qty(row.get("orders")),
            qty(row.get("units")),
            money(row.get("ticket_cents")),
            row.get("top_product", "—"),
        ])
    end = write_table(
        ws, formats, headers, values, start_row=start + 1,
        col_formats=[formats["center"], formats["money"], formats["money"], formats["money"], formats["money"],
                     formats["integer"], formats["integer"], formats["money"], formats["text"]],
    )
    ws.write(end + 2, 0, "El Excel se actualiza automáticamente al registrar pedidos y también puede generarse desde Admin → Reportes.", formats["subtitle"])

    # Pedidos (todos)
    ws_orders = workbook.add_worksheet("Pedidos")
    headers = ["Código", "Fecha", "Estado", "Pago", "Método", "Estación", "Cliente", "Moneda", "Subtotal", "Impuesto", "Total", "Nota"]
    values = []
    for order in all_orders:
        values.append([
            order.get("code", ""),
            excel_datetime(order.get("created_at")),
            order.get("status", ""),
            order.get("payment_status", ""),
            order.get("payment_method", ""),
            str(order.get("station") or ""),
            order.get("customer", ""),
            order.get("currency", ""),
            money(order.get("subtotal_cents")),
            money(order.get("tax_cents")),
            money(order.get("total_cents")),
            order.get("note", ""),
        ])
    end_orders = write_table(
        ws_orders, formats, headers, values,
        widths=[14, 18, 12, 12, 12, 10, 18, 9, 13, 13, 13, 32],
        col_formats=[formats["text"], formats["date"], formats["center"], formats["center"], formats["center"],
                     formats["center"], formats["text"], formats["center"], formats["money"], formats["money"],
                     formats["money"], formats["text"]],
    )
    if values:
        ws_orders.conditional_format(f"A2:C{end_orders + 1}", {
            "type": "formula", "criteria": '=$D2="reembolsado"', "format": formats["refunded_row"],
        })
        ws_orders.conditional_format(f"E2:L{end_orders + 1}", {
            "type": "formula", "criteria": '=$D2="reembolsado"', "format": formats["refunded_row"],
        })
        ws_orders.conditional_format(f"D2:D{end_orders + 1}", {
            "type": "text", "criteria": "containing", "value": "reembolsado", "format": formats["refunded"],
        })
        ws_orders.conditional_format(f"D2:D{end_orders + 1}", {
            "type": "text", "criteria": "containing", "value": "pagado", "format": formats["paid"],
        })
        ws_orders.conditional_format(f"D2:D{end_orders + 1}", {
            "type": "text", "criteria": "containing", "value": "pendiente", "format": formats["pending"],
        })

    # Detalle (todos los pedidos)
    ws_detail = workbook.add_worksheet("Detalle")
    headers = ["Código", "Fecha", "Pago", "Moneda", "Producto", "Categoría", "Cantidad", "Precio", "Importe"]
    values = []
    for order in all_orders:
        for item in order.get("items") or []:
            values.append([
                order.get("code", ""),
                excel_datetime(order.get("created_at")),
                order.get("payment_status", ""),
                order.get("currency", ""),
                item.get("name", ""),
                item.get("category", ""),
                qty(item.get("qty")),
                money(item.get("price_cents")),
                money(item.get("line_cents")),
            ])
    end_detail = write_table(
        ws_detail, formats, headers, values,
        widths=[14, 18, 12, 9, 28, 20, 10, 13, 13],
        col_formats=[formats["text"], formats["date"], formats["center"], formats["center"], formats["text"], formats["text"],
                     formats["integer"], formats["money"], formats["money"]],
    )
    if values:
        ws_detail.conditional_format(f"A2:B{end_detail + 1}", {
            "type": "formula", "criteria": '=$C2="reembolsado"', "format": formats["refunded_row"],
        })
        ws_detail.conditional_format(f"D2:I{end_detail + 1}", {
            "type": "formula", "criteria": '=$C2="reembolsado"', "format": formats["refunded_row"],
        })
        ws_detail.conditional_format(f"C2:C{end_detail + 1}", {
            "type": "text", "criteria": "containing", "value": "reembolsado", "format": formats["refunded"],
        })

    # Períodos
    add_period_sheet(workbook, formats, data, "diario", "Diario", primary, "line")
    add_period_sheet(workbook, formats, data, "semanal", "Semanal", primary, "line")
    add_period_sheet(workbook, formats, data, "mensual", "Mensual", primary, "column")
    add_period_sheet(workbook, formats, data, "anual", "Anual", primary, "column")

    # Productos
    ws_products = workbook.add_worksheet("Productos")
    headers = ["Producto", "Categoría", "Moneda", "Unidades", "Ingresos"]
    values = []
    for row in (data.get("products") or [])[:200]:
        values.append([row.get("name", ""), row.get("category", ""), row.get("currency", ""),
                       qty(row.get("qty")), money(row.get("revenue_cents"))])
    write_table(
        ws_products, formats, headers, values,
        widths=[30, 22, 9, 11, 14],
        col_formats=[formats["text"], formats["text"], formats["center"], formats["integer"], formats["money"]],
    )
    if values:
        end = min(len(values), 10) + 1
        add_chart(
            ws_products, workbook, "bar", "Top 10 productos por ingresos",
            f"='Productos'!$A$2:$A${end}", f"='Productos'!$E$2:$E${end}", "Ingresos",
            "H2",
        )

    # Categorías
    ws_categories = workbook.add_worksheet("Categorías")
    headers = ["Categoría", "Moneda", "Unidades", "Ingresos"]
    values = []
    for row in (data.get("categories") or []):
        values.append([row.get("name", ""), row.get("currency", ""), qty(row.get("qty")), money(row.get("revenue_cents"))])
    write_table(
        ws_categories, formats, headers, values,
        widths=[28, 9, 11, 14],
        col_formats=[formats["text"], formats["center"], formats["integer"], formats["money"]],
    )
    if values:
        end = len(values) + 1
        add_chart(
            ws_categories, workbook, "doughnut", "Ingresos por categoría",
            f"='Categorías'!$A$2:$A${end}", f"='Categorías'!$D$2:$D${end}", "Ingresos",
            "F2", size=(560, 340),
        )

    # Productos por período
    ws_pp = workbook.add_worksheet("Productos período")
    headers = ["Tipo", "Período", "Moneda", "Producto", "Unidades", "Ingresos"]
    values = []
    for row in (data.get("product_periods") or []):
        values.append([row.get("type", ""), row.get("period_label", ""), row.get("currency", ""),
                       row.get("product", ""), qty(row.get("qty")), money(row.get("revenue_cents"))])
    write_table(
        ws_pp, formats, headers, values,
        widths=[11, 18, 9, 30, 11, 14],
        col_formats=[formats["center"], formats["text"], formats["center"], formats["text"],
                     formats["integer"], formats["money"]],
    )

    # Pagos y reembolsos
    ws_pay = workbook.add_worksheet("Pagos")
    headers = ["Fecha", "Hora", "Código", "Tipo", "Método", "Moneda", "Importe", "Nota"]
    values = []
    for row in (data.get("payments") or []):
        values.append([row.get("date", ""), row.get("time", ""), row.get("code", ""), row.get("type", ""),
                       row.get("method", ""), row.get("currency", ""), money(row.get("amount_cents")), row.get("note", "")])
    end_payments = write_table(
        ws_pay, formats, headers, values,
        widths=[13, 9, 14, 12, 14, 9, 14, 28],
        col_formats=[formats["text"], formats["center"], formats["text"], formats["center"],
                     formats["center"], formats["center"], formats["money"], formats["text"]],
    )
    if values:
        ws_pay.conditional_format(f"A2:C{end_payments + 1}", {
            "type": "formula", "criteria": '=$D2="Reembolso"', "format": formats["refunded_row"],
        })
        ws_pay.conditional_format(f"E2:H{end_payments + 1}", {
            "type": "formula", "criteria": '=$D2="Reembolso"', "format": formats["refunded_row"],
        })
        ws_pay.conditional_format(f"D2:D{end_payments + 1}", {
            "type": "text", "criteria": "containing", "value": "Reembolso", "format": formats["refunded"],
        })
        ws_pay.conditional_format(f"G2:G{end_payments + 1}", {
            "type": "cell", "criteria": "<", "value": 0, "format": formats["negative"],
        })
        methods = {}
        for row in (data.get("payments") or []):
            if row.get("type") != "Pago":
                continue
            method = row.get("method") or "Sin método"
            currency = row.get("currency") or "—"
            key = f"{method} · {currency}"
            methods[key] = methods.get(key, 0.0) + money(row.get("amount_cents"))
        if methods:
            ws_pay.set_column("J:K", 16)
            ws_pay.write("J1", "Método", formats["header"])
            ws_pay.write("K1", "Cobrado", formats["header"])
            for index, (method, total) in enumerate(sorted(methods.items(), key=lambda item: -item[1]), start=1):
                ws_pay.write(1 + index, 9, method, formats["text"])
                ws_pay.write(1 + index, 10, total, formats["money"])
            method_end = len(methods) + 1
            add_chart(
                ws_pay, workbook, "column", "Cobros por método de pago",
                f"='Pagos'!$J$2:$J${method_end}", f"='Pagos'!$K$2:$K${method_end}",
                "Cobrado", "M2", size=(560, 300),
            )

    # Estados
    ws_status = workbook.add_worksheet("Estados")
    ws_status.set_column("A:A", 22)
    ws_status.set_column("B:B", 12)
    ws_status.set_column("C:C", 4)
    ws_status.set_column("D:D", 22)
    ws_status.set_column("E:E", 12)
    ws_status.write("A1", "Pedidos por estado", formats["section"])
    status_rows = [[key, qty(value)] for key, value in (data.get("status_counts") or {}).items()]
    end_status = write_table(ws_status, formats, ["Estado", "Pedidos"], status_rows, start_row=1,
                             col_formats=[formats["text"], formats["integer"]], autofilter=False)
    ws_status.write(1, 3, "Pedidos por estado de pago", formats["section"])
    payment_rows = [[key, qty(value)] for key, value in (data.get("payment_counts") or {}).items()]
    end_payment = write_table(ws_status, formats, ["Pago", "Pedidos"], payment_rows, start_row=1,
                              col_formats=[formats["text"], formats["integer"]], autofilter=False)
    if status_rows:
        add_chart(ws_status, workbook, "pie", "Pedidos por estado",
                  f"='Estados'!$A$2:$A${end_status}", f"='Estados'!$B$2:$B${end_status}",
                  "Pedidos", "G2", size=(420, 280))
    if payment_rows:
        add_chart(ws_status, workbook, "pie", "Pedidos por estado de pago",
                  f"='Estados'!$D$2:$D${end_payment}", f"='Estados'!$E$2:$E${end_payment}",
                  "Pedidos", "G18", size=(420, 280))

    # Gráficos del resumen, reutilizando las hojas de datos
    monthly = period_rows(data, "mensual", primary)
    if monthly:
        end = len(monthly) + 1
        add_chart(
            ws, workbook, "column", "Ingresos por mes",
            f"='Mensual'!$A$2:$A${end}", f"='Mensual'!$E$2:$E${end}", "Ingresos",
            "A13", size=(620, 300),
        )
    if data.get("products"):
        end = min(len(data["products"]), 10) + 1
        add_chart(
            ws, workbook, "bar", "Top 10 productos",
            f"='Productos'!$A$2:$A${end}", f"='Productos'!$E$2:$E${end}", "Ingresos",
            "J13", size=(620, 300),
        )
    if data.get("categories"):
        end = len(data["categories"]) + 1
        add_chart(
            ws, workbook, "doughnut", "Ingresos por categoría",
            f"='Categorías'!$A$2:$A${end}", f"='Categorías'!$D$2:$D${end}", "Ingresos",
            "A30", size=(560, 320),
        )
    if status_rows:
        add_chart(
            ws, workbook, "pie", "Pedidos por estado",
            f"='Estados'!$A$2:$A${end_status}", f"='Estados'!$B$2:$B${end_status}", "Pedidos",
            "J30", size=(560, 320),
        )

    workbook.close()


def main():
    if len(sys.argv) != 3:
        print("Uso: build_reports.py <entrada.json> <salida.xlsx>", file=sys.stderr)
        return 2
    input_path, output_path = sys.argv[1], sys.argv[2]
    if not os.path.exists(input_path):
        print(f"No existe el archivo de datos: {input_path}", file=sys.stderr)
        return 1
    data = load_data(input_path)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    build(data, output_path)
    print(f"Excel generado: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
