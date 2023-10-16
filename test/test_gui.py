import tkinter as tk
import sys
sys.path.append( '.' )
from src.GUI import gui
def main():
    root = tk.Tk()
    gui_instance = gui.GUI(root)  # 创建 GUI 实例
    root.mainloop()

if __name__ == "__main__":
    main()  # 运行主函数



